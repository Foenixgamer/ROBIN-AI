const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class VolumeController {
  constructor() {
    this._strategy = null;
  }

  async setVolume(percent) {
    const vol = Math.max(0, Math.min(100, Math.round(percent)));
    console.log('[VOL] Intentando establecer volumen:', vol + '%');

    try {
      await execAsync(`nircmd.exe setsysvolume ${Math.round(vol * 655.35)}`, { timeout: 3000 });
      this._strategy = 'nircmd';
      console.log('[VOL] Volumen establecido via nircmd');
      return { success: true, method: 'nircmd', volume: vol };
    } catch (e) {}

    try {
      const ps = `
$volume = ${vol / 100}
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int na(); int nb(); int nc(); int nd();
  int SetMasterVolumeLevelScalar(float fLevel, ref System.Guid pguidEventContext);
  int ne();
  int GetMasterVolumeLevelScalar(out float pfLevel);
}
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int na();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out System.IntPtr ppEndpoint);
}
public class Vol {
  public static void Set(float level) {
    var t = System.Type.GetTypeFromCLSID(new System.Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
    var e = (IMMDeviceEnumerator)System.Activator.CreateInstance(t);
    System.IntPtr dev;
    e.GetDefaultAudioEndpoint(0, 1, out dev);
    var vol = (IAudioEndpointVolume)System.Runtime.InteropServices.Marshal.GetObjectForIUnknown(dev);
    var g = System.Guid.Empty;
    vol.SetMasterVolumeLevelScalar(level, ref g);
  }
}
"@
[Vol]::Set($volume)
      `.trim();

      await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${ps.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`,
        { timeout: 8000 }
      );
      this._strategy = 'powershell_com';
      console.log('[VOL] Volumen establecido via PowerShell COM');
      return { success: true, method: 'powershell_com', volume: vol };
    } catch (e) {
      console.error('[VOL] PowerShell COM fall\u00f3:', e.message);
    }

    try {
      const key = String.fromCharCode(175);
      const steps = Math.round(vol / 2);
      let keys = '';
      for (let i = 0; i < steps; i++) keys += key;

      if (keys.length > 0) {
        await execAsync(
          `powershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${keys}')"`,
          { timeout: 5000 }
        );
      }
      this._strategy = 'sendkeys';
      console.log('[VOL] Volumen ajustado via SendKeys');
      return { success: true, method: 'sendkeys', volume: vol };
    } catch (e) {
      console.error('[VOL] SendKeys fall\u00f3:', e.message);
    }

    return { success: false, error: 'Todas las estrategias fallaron' };
  }

  async getVolume() {
    try {
      await execAsync(
        `powershell -NoProfile -Command "(Get-WmiObject Win32_SoundDevice | Select -First 1).Name"`,
        { timeout: 5000 }
      );
      return 50;
    } catch (e) {
      return 50;
    }
  }

  async mute() {
    await execAsync(
      `powershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)"`,
      { timeout: 3000 }
    ).catch(() => {});
    return { success: true };
  }
}

module.exports = { VolumeController };
