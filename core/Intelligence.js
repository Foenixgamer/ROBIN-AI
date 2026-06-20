const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

class Intelligence {
  constructor() {
    this._weatherCache = { data: null, time: 0 };
    this._ipCache = { data: null, time: 0 };
    this._weatherTTL = 300000;
    this._ipTTL = 600000;
    this._googleApiKey = '';
    this._safeBrowsingCache = new Map();
  }

  setGoogleApiKey(key) {
    this._googleApiKey = key;
  }

  async getWeather(city = '') {
    const now = Date.now();
    if (this._weatherCache.data && (now - this._weatherCache.time) < this._weatherTTL && !city) {
      return this._weatherCache.data;
    }

    try {
      const location = city || 'auto:ip';
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const current = data.current_condition?.[0];
      const forecast = data.weather?.slice(0, 3) || [];

      const result = {
        location: data.nearest_area?.[0]?.areaName?.[0]?.value || city || 'Desconocido',
        country: data.nearest_area?.[0]?.country?.[0]?.value || '',
        temp: current?.temp_C || '—',
        feelsLike: current?.FeelsLikeC || '—',
        humidity: current?.humidity || '—',
        windSpeed: current?.windspeedKmph || '—',
        description: current?.weatherDesc?.[0]?.value || '—',
        forecast: forecast.map(d => ({
          date: d.date,
          max: d.maxtempC,
          min: d.mintempC,
          desc: d.hourly?.[0]?.weatherDesc?.[0]?.value || '—',
        })),
      };

      if (!city) {
        this._weatherCache = { data: result, time: now };
      }
      return result;
    } catch (err) {
      console.error('Weather error:', err.message);
      return { error: `No pude consultar el clima: ${err.message}`, location: city || 'desconocida' };
    }
  }

  async getSecurityNews() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        'https://feeds.feedburner.com/eset/blog?format=xml',
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const xml = await res.text();
      const items = [];
      const itemRegex = /<item>[\s\S]*?<\/item>/g;
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/;
      const linkRegex = /<link>(.*?)<\/link>/;
      const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/;
      const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
        const item = match[0];
        const title = item.match(titleRegex)?.[1] || '';
        const link = item.match(linkRegex)?.[1] || '';
        const description = item.match(descRegex)?.[1]?.replace(/<[^>]*>/g, '').substring(0, 200) || '';
        const pubDate = item.match(pubDateRegex)?.[1] || '';
        items.push({ title, link, description, pubDate });
      }

      return items;
    } catch (err) {
      console.error('News error:', err.message);
      return [];
    }
  }

  async getPublicIp() {
    const now = Date.now();
    if (this._ipCache.data && (now - this._ipCache.time) < this._ipTTL) {
      return this._ipCache.data;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = { ip: data.ip };

      try {
        const geoRes = await fetch(`https://ipapi.co/${data.ip}/json/`, {
          signal: AbortSignal.timeout(5000),
        });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          result.city = geo.city || '';
          result.country = geo.country_name || '';
          result.org = geo.org || '';
        }
      } catch (e) {}

      this._ipCache = { data: result, time: now };
      return result;
    } catch (err) {
      console.error('IP error:', err.message);
      return { ip: 'No disponible', error: err.message };
    }
  }

  async checkBreach(email) {
    try {
      const SHA1 = require('crypto').createHash('sha1').update(email).digest('hex').toUpperCase();
      const prefix = SHA1.substring(0, 5);
      const suffix = SHA1.substring(5);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        { signal: controller.signal, headers: { 'Add-Padding': 'true' } }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const lines = text.split('\n');
      const found = lines.find(line => line.startsWith(suffix));

      if (found) {
        const count = parseInt(found.split(':')[1], 10);
        return { breached: true, count, message: `${email} aparece en ${count} filtraciones.` };
      }
      return { breached: false, count: 0, message: `${email} no está en filtraciones conocidas.` };
    } catch (err) {
      console.error('Breach error:', err.message);
      return { error: `No pude verificar: ${err.message}` };
    }
  }

  async investigateDomain(domain) {
    try {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim().toLowerCase();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://urlhaus-api.abuse.ch/v1/host/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `host=${cleanDomain}`,
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.query_status === 'ok') {
        return {
          malicious: true,
          domain: cleanDomain,
          urls: data.urls?.length || 0,
          firstSeen: data.firstseen || '—',
          lastSeen: data.lastseen || '—',
          threat: data.urlhaus_reference || '',
          tags: data.tags || [],
          message: `${cleanDomain} está marcado como MALICIOSO en URLhaus. ${data.urls?.length || 0} URLs reportadas.`,
        };
      }

      let googleThreat = null;
      if (this._googleApiKey) {
        googleThreat = await this._googleSafeBrowsingCheck(cleanDomain);
      }

      if (googleThreat) {
        return googleThreat;
      }

      return {
        malicious: false,
        domain: cleanDomain,
        message: `${cleanDomain} no aparece en listas de amenazas conocidas.`,
      };
    } catch (err) {
      console.error('Domain investigate error:', err.message);
      return { error: `No pude investigar: ${err.message}`, domain };
    }
  }

  async _googleSafeBrowsingCheck(url) {
    try {
      const body = {
        client: { clientId: 'robin-desktop', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ALL_PLATFORMS'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      };

      const res = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${this._googleApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.matches && data.matches.length > 0) {
        const threats = data.matches.map(m => m.threatType).join(', ');
        return {
          malicious: true,
          domain: url,
          source: 'Google Safe Browsing',
          threat: threats,
          message: `${url} está marcado como PELIGROSO por Google: ${threats}`,
        };
      }

      return null;
    } catch (err) {
      console.error('Google Safe Browsing error:', err.message);
      return null;
    }
  }

  async googleThreatSearch(query) {
    if (!this._googleApiKey) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${this._googleApiKey}&cx=017261662853719511560:jrnwvg7y1zs&q=${encodeURIComponent(query + ' seguridad informática')}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items.slice(0, 3).map(item => ({
          title: item.title,
          snippet: item.snippet,
          link: item.link,
        }));
      }
      return null;
    } catch (err) {
      console.error('Google Search error:', err.message);
      return null;
    }
  }

  async getLocation() {
    try {
      const ipData = await this.getPublicIp();
      if (ipData.city || ipData.country) {
        return `${ipData.city || ''}${ipData.city && ipData.country ? ', ' : ''}${ipData.country || ''}`;
      }
    } catch (e) {}
    return 'Ubicación desconocida';
  }
}

module.exports = { Intelligence };
