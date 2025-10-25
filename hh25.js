(function () {
  const DEFAULT_TARGET_HASH = 'b0a098d57b659825ebf6fcc3d23f775a2279e8cf4bf848d8c61b61e2bbb02379';
  const DEFAULT_EMPTY_HASH = '10f4adc9fad19b9a6845f93b52bf4b1a0a7fa7d374bddb1e40d23a80c763669f';
  const STATUS_CLASSES = ['valid', 'invalid', 'empty'];
  const STATUS_MESSAGES = {
    valid: '',
    invalid: '',
    empty: ''
  };
  const dataset = document.body ? document.body.dataset : {};
  const TARGET_HASH = dataset.targetHash || DEFAULT_TARGET_HASH;
  const EMPTY_HASH = dataset.emptyHash || DEFAULT_EMPTY_HASH;
  const CELEBRATION_CONFIGS = {
    balloons: { entity: '&#x1F388;', count: 16, durationRange: [5.5, 7] },
    unicorns: { entity: '&#x1F984;', count: 12, durationRange: [6, 8] },
    stars: { entity: '&#x2728;', count: 22, durationRange: [4.5, 6.5] },
    fireworks: { entity: '&#x1F973;', count: 80, durationRange: [1.6, 2.2], burst: true }
  };
  const CELEBRATION_TYPES = Object.keys(CELEBRATION_CONFIGS);
  const form = document.getElementById('hh25-form');
  const calculationLine = document.getElementById('calculation-line');
  const hashLine = document.getElementById('hash-line');
  const statusMessage = document.getElementById('status-message');
  const countdownElement = document.getElementById('countdown');

  if (!form || !calculationLine || !hashLine || !statusMessage) {
    return;
  }

  let currentStatus = null;
  let countdownIntervalId = null;
  let flashTimeoutId = null;

  const FIELD_DEFINITIONS = [
    {
      label: 'Caretaker',
      present: () => hasElement('caretaker-name'),
      getRaw: () => getElementValue('caretaker-name'),
      normalize: sanitizeText,
      score: stringScore
    },
    {
      label: 'Pumpkins',
      present: () => hasElement('pumpkin-count'),
      getRaw: () => getElementValue('pumpkin-count'),
      normalize: sanitizeNumberString,
      score: numericScore
    },
    {
      label: 'Veil Night',
      present: () => hasElement('veil-date'),
      getRaw: () => getElementValue('veil-date'),
      normalize: (value) => value.trim(),
      score: dateScore
    },
    {
      label: 'Lantern Hour',
      present: () => hasElement('lantern-time'),
      getRaw: () => getElementValue('lantern-time'),
      normalize: (value) => value.trim(),
      score: timeScore
    },
    {
      label: 'Ward Hue',
      present: () => hasElement('moon-color'),
      getRaw: () => getElementValue('moon-color'),
      normalize: (value) => value.trim().toLowerCase(),
      score: colorScore
    },
    {
      label: 'Guide',
      present: () => hasElement('familiar-select'),
      getRaw: () => getElementValue('familiar-select'),
      normalize: sanitizeText,
      score: stringScore
    },
    {
      label: 'Path',
      present: () => Boolean(form.querySelector('input[name="path-choice"]')),
      getRaw: () => {
        const choice = form.querySelector('input[name="path-choice"]:checked');
        return choice ? choice.value : '';
      },
      normalize: sanitizeText,
      score: stringScore
    },
    {
      label: 'Charms',
      present: () => Boolean(form.querySelector('input[name="charms"]')),
      getRaw: () => Array.from(form.querySelectorAll('input[name="charms"]:checked')).map((input) => input.value),
      normalize: sanitizeCharms,
      score: stringScore
    },
    {
      label: 'Hum',
      present: () => hasElement('hum-intensity'),
      getRaw: () => getElementValue('hum-intensity'),
      normalize: sanitizeNumberString,
      score: numericScore
    },
    {
      label: 'Courier',
      present: () => hasElement('courier-email'),
      getRaw: () => getElementValue('courier-email'),
      normalize: sanitizeText,
      score: stringScore
    },
    {
      label: 'Signal',
      present: () => hasElement('signal-phone'),
      getRaw: () => getElementValue('signal-phone'),
      normalize: sanitizeTel,
      score: stringScore
    },
    {
      label: 'Safehouse',
      present: () => hasElement('safehouse-url'),
      getRaw: () => getElementValue('safehouse-url'),
      normalize: (value) => value.trim().toLowerCase(),
      score: stringScore
    },
    {
      label: 'Oath',
      present: () => hasElement('oath-text'),
      getRaw: () => getElementValue('oath-text'),
      normalize: sanitizeText,
      score: stringScore
    },
    {
      label: 'Secret',
      present: () => hasElement('secret-code'),
      getRaw: () => getElementValue('secret-code'),
      normalize: sanitizeText,
      score: stringScore
    }
  ];

  const inputs = Array.from(form.querySelectorAll('input, select, textarea'));

  inputs.forEach((element) => {
    const eventName = element.type === 'checkbox' || element.type === 'radio' ? 'change' : 'input';
    element.addEventListener(eventName, updateState);
    if (eventName !== 'input') {
      element.addEventListener('input', updateState);
    }
  });

  updateState();
  startCountdown();

  async function updateState() {
    const fields = collectState();
    const segments = computeSegments(fields);
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const expression = segments.map((segment) => `${segment.value}`).join(' + ');
    const calculationText = segments.length > 0 ? `${expression} = ${total}` : '0';

    calculationLine.textContent = `CODE: ${calculationText}`;

    const normalizedString = buildNormalizedString(fields);
    let hashHex = '';

    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedString));
      hashHex = bufferToHex(hashBuffer);
    } catch (error) {
      hashHex = 'hash unavailable';
      console.error('Unable to compute hash', error);
    }

    hashLine.textContent = `SHA-256: ${hashHex}`;
    setStatus(determineStatus(hashHex));
  }

  function collectState() {
    return FIELD_DEFINITIONS.filter((field) => field.present()).map((field) => {
      const rawValue = field.getRaw();
      const normalizer = field.normalize || identity;
      return {
        label: field.label,
        normalized: normalizer(rawValue),
        score: field.score
      };
    });
  }

  function computeSegments(fields) {
    return fields.map((field) => ({
      label: field.label,
      value: field.score(field.normalized)
    }));
  }

  function buildNormalizedString(fields) {
    return fields.map((field) => field.normalized).join('::');
  }

  function getElementValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
  }

  function hasElement(id) {
    return Boolean(document.getElementById(id));
  }

  function identity(value) {
    return value;
  }

  function sanitizeText(value) {
    return value ? value.trim().toLowerCase() : '';
  }

  function sanitizeNumberString(value) {
    return value ? value.trim() : '';
  }

  function sanitizeCharms(list) {
    if (!list || list.length === 0) {
      return '';
    }
    return list.slice().sort().join('|').toLowerCase();
  }

  function sanitizeTel(value) {
    if (!value) {
      return '';
    }
    const trimmed = value.trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/[^0-9]/g, '');
    if (!digits) {
      return '';
    }
    return hasPlus ? `+${digits}` : digits;
  }

  function stringScore(text) {
    if (!text) {
      return 0;
    }
    return Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  function numericScore(text) {
    if (!text) {
      return 0;
    }
    const value = Number(text);
    return Number.isFinite(value) ? value : 0;
  }

  function dateScore(text) {
    if (!text) {
      return 0;
    }
    const number = Number(text.replace(/-/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function timeScore(text) {
    if (!text) {
      return 0;
    }
    const [hours, minutes] = text.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 0;
    }
    return hours * 60 + minutes;
  }

  function colorScore(text) {
    if (!text || !text.startsWith('#') || text.length < 4) {
      return 0;
    }
    const parsed = parseInt(text.slice(1), 16);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  function determineStatus(hash) {
    if (TARGET_HASH && hash === TARGET_HASH) {
      return 'valid';
    }
    if (EMPTY_HASH && hash === EMPTY_HASH) {
      return 'empty';
    }
    return 'invalid';
  }

  function setStatus(status) {
    if (status !== currentStatus) {
      if (status === 'valid') {
        triggerCelebration();
        showSuccessNav();
      } else {
        clearCelebration();
        hideSuccessNav();
      }
      currentStatus = status;
    }
    STATUS_CLASSES.forEach((cls) => document.body.classList.toggle(cls, cls === status));
    applyStatus(calculationLine, status);
    applyStatus(hashLine, status);
    applyStatus(statusMessage, status);
    statusMessage.textContent = STATUS_MESSAGES[status] || STATUS_MESSAGES.invalid;
  }

  function applyStatus(element, status) {
    STATUS_CLASSES.forEach((cls) => element.classList.toggle(cls, cls === status));
  }

  function triggerCelebration() {
    if (!document.body) {
      return;
    }
    const celebrationType = dataset.celebration && CELEBRATION_CONFIGS[dataset.celebration]
      ? dataset.celebration
      : 'balloons';
    const config = CELEBRATION_CONFIGS[celebrationType] || CELEBRATION_CONFIGS.balloons;
    const layer = getCelebrationLayer();
    if (!layer) {
      return;
    }

    layer.classList.remove('active');
    CELEBRATION_TYPES.forEach((type) => layer.classList.remove(type));
    layer.innerHTML = '';

    layer.classList.add('active', celebrationType);

    for (let index = 0; index < config.count; index += 1) {
      const item = document.createElement('span');
      item.className = 'celebration-item';
      item.innerHTML = config.entity;
      item.style.left = `${Math.random() * 100}%`;
      item.style.animationDelay = `${Math.random() * 2.2}s`;
      if (config.burst) {
        item.style.top = `${Math.random() * 80 + 10}%`;
      }
      if (config.durationRange) {
        const [min, max] = config.durationRange;
        const duration = min + Math.random() * (max - min);
        item.style.animationDuration = `${duration}s`;
      }
      layer.appendChild(item);
    }
  }

  function clearCelebration() {
    const layer = document.getElementById('celebration-layer');
    if (!layer) {
      return;
    }
    layer.classList.remove('active');
    CELEBRATION_TYPES.forEach((type) => layer.classList.remove(type));
    layer.innerHTML = '';
  }

  function getCelebrationLayer() {
    let layer = document.getElementById('celebration-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'celebration-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function showSuccessNav() {
    const nextPageBase = dataset.nextPage;
    const targetHash = dataset.targetHash;
    if (!nextPageBase || !targetHash) {
      return;
    }

    let nav = document.getElementById('success-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'success-nav';
      nav.className = 'success-nav';

      const title = document.createElement('p');
      title.className = 'success-nav__title';
      title.textContent = 'Pass';

      const link = document.createElement('a');
      link.className = 'success-nav__link';
      link.rel = 'next';

      nav.appendChild(title);
      nav.appendChild(link);
      document.body.appendChild(nav);
    }

    const link = nav.querySelector('a');
    link.href = `${nextPageBase}-${targetHash}.html`;
    link.textContent = ` >> ${nextPageBase}`;
    link.setAttribute('aria-label', `>> ${nextPageBase}`);

    nav.classList.add('visible');
  }

  function hideSuccessNav() {
    const nav = document.getElementById('success-nav');
    if (!nav) {
      return;
    }
    nav.classList.remove('visible');
  }

  function startCountdown() {
    if (!countdownElement) {
      return;
    }

    if (countdownIntervalId !== null) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }

    const target = Date.UTC(2025, 9, 31, 17, 0, 0, 0);

    function updateCountdown() {
      const now = Date.now();
      const diffMs = target - now;
      if (diffMs <= 0) {
        countdownElement.textContent = 'Countdown complete.';
        countdownElement.classList.remove('countdown--flash');
        if (countdownIntervalId !== null) {
          clearInterval(countdownIntervalId);
          countdownIntervalId = null;
        }
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      countdownElement.innerHTML = `
        <span class="countdown__label">31 Oct 2025 &mdash; 17:00 GMT </span>
        <span class="countdown__value">${days} days</span>
        <span class="countdown__value">${hours} hours</span>
        <span class="countdown__value">${minutes} minutes</span>
        <span class="countdown__value">${seconds} seconds</span>
      `;

      countdownElement.classList.add('countdown--flash');
      if (flashTimeoutId !== null) {
        clearTimeout(flashTimeoutId);
      }
      flashTimeoutId = setTimeout(() => {
        countdownElement.classList.remove('countdown--flash');
      }, 420);
    }

    updateCountdown();
    countdownIntervalId = setInterval(updateCountdown, 1000);
  }
})();
