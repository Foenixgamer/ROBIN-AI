class FactExtractor {
  extractFacts(userInput) {
    const facts = [];
    const lower = userInput.toLowerCase();

    const nameMatch = userInput.match(/mi nombre es ([A-Za-záéíóúÁÉÍÓÚñÑ]+)/i);
    if (nameMatch) facts.push({ key: 'nombre', value: nameMatch[1], priority: 3 });

    const jobMatch = userInput.match(/(?:trabajo en|soy|me dedico a|estudio)\s+(.+?)(?:\.|,|$)/i);
    if (jobMatch) facts.push({ key: 'profesion', value: jobMatch[1].trim(), priority: 3 });

    const projectMatch = userInput.match(/(?:estoy desarrollando|estoy trabajando en|mi proyecto)\s+(.+?)(?:\.|,|$)/i);
    if (projectMatch) facts.push({ key: `proyecto_${Date.now()}`, value: projectMatch[1].trim(), priority: 3 });

    const techTopics = [
      'ciberseguridad', 'programación', 'inteligencia artificial',
      'redes', 'machine learning', 'python', 'javascript', 'linux',
      'hacking', 'android', 'electron', 'base de datos',
    ];
    techTopics.forEach(topic => {
      if (lower.includes(topic)) facts.push({ key: `interes_${topic.replace(' ', '_')}`, value: topic, priority: 2 });
    });

    if (/recuerda que|no olvides que|guarda que/i.test(userInput)) {
      const rememberMatch = userInput.match(/(?:recuerda que|no olvides que|guarda que)\s+(.+)/i);
      if (rememberMatch) facts.push({ key: `recordar_${Date.now()}`, value: rememberMatch[1].trim(), priority: 3 });
    }

    return facts;
  }
}

module.exports = { FactExtractor };
