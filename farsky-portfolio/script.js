/**
 * ============================================================================
 * FARSKY INTERACTIVE PORTFOLIO - MAIN SCRIPT (STEP 2: ID CARD & LANYARD)
 * ============================================================================
 *
 * ARCHITECTURE OVERVIEW (For Beginners):
 * This portfolio is controlled by ONE State Machine so nothing runs twice or
 * out of order. Across Steps 1 to 5, the page moves through 9 states:
 *
 *   LOADING -> INTRO -> PULLING -> (SNAPBACK -> INTRO) or RELEASE
 *           -> TRANSITION -> BUILD -> HANDOFF -> LIVE
 *
 * What happens in Step 2:
 * 1. Progressive Enhancement: If JavaScript or GSAP fails to load, the visitor
 *    immediately sees the finished portfolio. When GSAP is ready, we add
 *    "js-intro-active" and "is-locked-scroll" to <html>, showing the ID card.
 * 2. Idle Pendulum & Float: One GSAP ticker gently swings the badge and updates
 *    the SVG lanyard curve in the same frame with zero DOM layout reads.
 * 3. Custom Pointer Physics: Dragging the card down applies a rubber-band
 *    formula: displayedPull = d / (1 + d / k). Crossing the distance or flick
 *    velocity threshold triggers RELEASE; letting go early triggers SNAPBACK
 *    with elastic.out(1, 0.4) and a dynamic string whip.
 * 4. Keyboard & Reduced Motion: Enter/Space triggers an animated pull,
 *    ArrowDown nudges the card with tension, "Skip intro" jumps straight to
 *    LIVE at any time, and prefers-reduced-motion shows a static card with
 *    an "Open site" button that fades into LIVE in <= 200ms.
 */

/* ============================================================================
   1. EDIT ME - SINGLE SOURCE OF TRUTH FOR ALL PORTFOLIO CONTENT
   ============================================================================
   HOW TO EDIT:
   - Change any value inside CONTENT below and save the file.
   - Both the ID card badge and the final portfolio read from this object.
   - Keep [YOUR_NAME] and [YOUR_EMAIL] as placeholders until you are ready to
     use a public handle and a separate public contact email.
   - For projects: leave url as '' to show a non-clickable "Coming soon" card.
     When you have a real link (like 'https://github.com/...'), paste it into
     url and the card automatically becomes an accessible clickable link!
   ============================================================================ */
const CONTENT = {
  topLine: '@surockboyo',          // public GitHub handle from github.com/surockboyo
  name: 'Farsky',
  title: 'Frontend Developer & AI Enthusiast',
  about: 'I am a junior high student building my skills in web development and AI.',
  email: 'farskyrf@gmail.com',
  socials: [
    { label: 'WhatsApp (+62 831-6729-5938)', url: 'https://wa.me/6283167295938' },
    { label: 'X (@Farsky852316)', url: 'https://x.com/Farsky852316' },
    { label: 'TikTok (@farsky_rf · chicken profile)', url: 'https://www.tiktok.com/@farsky_rf' },
    { label: 'GitHub (@surockboyo)', url: 'https://github.com/surockboyo' }
  ],
  projects: [
    {
      title: 'Class7C',
      blurb: 'Class 7C Website built with JavaScript.',
      tags: ['JS', 'HTML', 'CSS'],
      url: 'https://github.com/surockboyo/Class7C'
    },
    {
      title: 'Class-7C-Website',
      blurb: 'JavaScript web repository on GitHub.',
      tags: ['JS'],
      url: 'https://github.com/surockboyo/Class-7C-Website'
    },
    {
      title: 'FarskyRF',
      blurb: 'Powerfull bot repository on GitHub.',
      tags: ['Bot'],
      url: 'https://github.com/surockboyo/FarskyRF'
    }
  ]
};

/* ============================================================================
   2. TUNING CONFIGURATION (Every number explained for easy tweaking)
   ============================================================================ */
const CONFIG = {
  // Pull physics constants (Section 7):
  rubberBandVhRatio: 0.40,     // k = 40% of viewport height; raise this to make the card easier to pull further
  minPullDistancePx: 140,      // minimum raw drag distance (px) required to unlock the portfolio
  minPullVhRatio: 0.30,        // or 30% of viewport height (whichever is larger)
  flickVelocityPxPerMs: 1.2,   // downward flick speed (px/ms) that triggers unlock even on a shorter pull
  flickMinDistancePx: 70,      // minimum drag distance (px) required when doing a fast downward flick
  maxCardTiltDeg: 12,          // maximum card rotation (degrees) when pulling left or right
  horizontalDamping: 0.28,     // how far the card moves sideways relative to your pointer (0.28 = 28%)

  // Idle pendulum motion constants:
  idleSwingDeg: 2.2,           // gentle pendulum rotation amplitude in degrees at rest
  idleSwingSpeed: 1.35,        // pendulum speed multiplier (radians per second)
  idleFloatPx: 5.0,            // gentle vertical bobbing amplitude in pixels at rest
  idleFloatSpeed: 2.1,         // vertical float speed multiplier

  // Keyboard ArrowDown pull constants:
  arrowDownStepPx: 42,         // how many raw pixels each ArrowDown press adds to the pull
  arrowReleaseDelayMs: 480,    // how long after letting go of ArrowDown before the card snaps back

  // Reduced motion fade timing:
  reducedMotionFadeMs: 180,    // <= 200ms simple fade when prefers-reduced-motion is enabled

  // Step 4: AI Cursor & Scramble timings:
  scrambleGlyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#/%*+=-_',
  buildStepTravelSec: 0.34,    // curved cursor travel duration per step on desktop
  buildStepMobileSec: 0.24,    // faster travel duration on mobile screens (<= 768px)

  // Step 3: Web Audio synthesis limits (Section 8):
  soundPeakGain: 0.15,         // hard cap on peak gain so audio is never loud or harsh
  stretchBaseFreqHz: 260,      // resting band-pass frequency (Hz) for fabric lanyard tension
  stretchMaxFreqHz: 1180,      // highest band-pass frequency (Hz) at full pull tension
  soundStorageKey: 'farsky_sound_muted',

  // Project card 3D hover tilt (LIVE state):
  cardMaxTiltDeg: 5.5          // maximum 3D tilt angle in degrees toward the mouse pointer
};

/* ============================================================================
   3. STATE MACHINE CONTROLLER (Single state variable, single transition gate)
   ============================================================================ */
const STATES = Object.freeze({
  LOADING: 'LOADING',
  LEGACY: 'LEGACY',
  SINGULARITY: 'SINGULARITY',
  CONSUMING: 'CONSUMING',
  BUILD: 'BUILD',
  HANDOFF: 'HANDOFF',
  LIVE: 'LIVE'
});

let currentState = STATES.LOADING;

/**
 * Announces state changes in the polite ARIA live region for screen readers.
 */
function announceToScreenReader(message) {
  const announcer = document.getElementById('live-announcer');
  if (!announcer) return;
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/* ============================================================================
   3B. WEB AUDIO SOUND ENGINE (No audio files; synthesized from noise & sine)
   ============================================================================
   How it works (for beginners):
   - Browsers block audio until the user clicks or presses a key. So we create
     the AudioContext lazily inside the first pointerdown/keydown event.
   - Stretch sound: We loop a 1.5-second buffer of white noise through a
     bandpass filter. As you pull further, the filter frequency rises from
     260 Hz to 1180 Hz and the gain rises smoothly (using setTargetAtTime) so
     it sounds like woven fabric under tension, never like a siren.
   - Snap-back clack: A crisp ~80ms high-pass noise burst layered with a fast
     140 Hz -> 52 Hz sine thump when the badge hits rest.
   - Peak gain is strictly capped at 0.15, and all nodes stop/disconnect cleanly.
   ============================================================================ */
const soundEngine = {
  ctx: null,
  masterGain: null,
  noiseBuffer: null,
  stretchSrc: null,
  stretchFilter: null,
  stretchGain: null,
  isMuted: false,
  toggleBtn: null,
  toggleLabel: null,

  loadMutePreference(isReducedMotion) {
    if (isReducedMotion) {
      this.isMuted = true;
      return;
    }
    try {
      const saved = window.localStorage.getItem(CONFIG.soundStorageKey);
      this.isMuted = saved === 'true';
    } catch (_err) {
      this.isMuted = false;
    }
  },

  saveMutePreference() {
    try {
      window.localStorage.setItem(CONFIG.soundStorageKey, String(this.isMuted));
    } catch (_err) {
      // Ignore storage errors in private browsing or restricted contexts
    }
  },

  syncToggleUI() {
    if (!this.toggleBtn || !this.toggleLabel) return;
    this.toggleBtn.setAttribute('aria-pressed', String(this.isMuted));
    this.toggleBtn.setAttribute('aria-label', this.isMuted ? 'Unmute sound effects' : 'Mute sound effects');
    this.toggleLabel.textContent = this.isMuted ? 'Sound: Off' : 'Sound: On';
  },

  ensureContext() {
    if (this.isMuted) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = CONFIG.soundPeakGain;
      this.masterGain.connect(this.ctx.destination);

      // Build a reusable 1.5s white-noise buffer for fabric friction & clacks
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },

  startStretch() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || this.stretchSrc) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(CONFIG.stretchBaseFreqHz, ctx.currentTime);
    filter.Q.setValueAtTime(2.6, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();

    this.stretchSrc = src;
    this.stretchFilter = filter;
    this.stretchGain = gain;
  },

  updateStretch(tension, velocityPxPerMs) {
    if (this.isMuted || !this.ctx || !this.stretchFilter || !this.stretchGain) return;
    const now = this.ctx.currentTime;
    const clampedT = Math.max(0, Math.min(1.15, tension));
    const velBoost = Math.min(0.35, Math.abs(velocityPxPerMs || 0) * 0.14);

    // Map pull distance to bandpass frequency (fabric rub) + subtle velocity grain
    const freq = CONFIG.stretchBaseFreqHz + clampedT * (CONFIG.stretchMaxFreqHz - CONFIG.stretchBaseFreqHz) + velBoost * 240;
    // Keep stretch gain gentle (<= 0.55 of masterGain=0.15)
    const targetGain = clampedT > 0.02 ? Math.min(0.55, 0.06 + clampedT * 0.34 + velBoost * 0.12) : 0.0001;

    this.stretchFilter.frequency.setTargetAtTime(freq, now, 0.035);
    this.stretchGain.gain.setTargetAtTime(targetGain, now, 0.035);
  },

  stopStretch() {
    if (!this.ctx || !this.stretchSrc || !this.stretchGain) return;
    const now = this.ctx.currentTime;
    const src = this.stretchSrc;
    const filter = this.stretchFilter;
    const gain = this.stretchGain;

    this.stretchSrc = null;
    this.stretchFilter = null;
    this.stretchGain = null;

    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.025);
      setTimeout(() => {
        try {
          src.stop();
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (_e) {}
      }, 120);
    } catch (_err) {}
  },

  playClack() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;

    // 1. Short high-pass noise burst (~80ms plastic/metal clip clack)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1450, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.65, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noiseSrc.connect(hp);
    hp.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.085);
    noiseSrc.onended = () => {
      try {
        noiseSrc.disconnect();
        hp.disconnect();
        noiseGain.disconnect();
      } catch (_e) {}
    };

    // 2. Quick low sine thump (~80ms body resonance)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.08);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.75, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
    osc.onended = () => {
      try {
        osc.disconnect();
        oscGain.disconnect();
      } catch (_e) {}
    };
  },

  silenceImmediately() {
    this.stopStretch();
    this.stopBlackHoleRumble();
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  },

  startBlackHoleRumble(durationSec = 2.4) {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.stopBlackHoleRumble();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const subGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(34, now);
    osc.frequency.exponentialRampToValueAtTime(142, now + durationSec);

    subGain.gain.setValueAtTime(0.01, now);
    subGain.gain.linearRampToValueAtTime(0.85, now + durationSec * 0.88);

    osc.connect(subGain);
    subGain.connect(this.masterGain);
    osc.start(now);

    this.rumbleOsc = osc;
    this.rumbleGain = subGain;
  },

  stopBlackHoleRumble() {
    if (!this.rumbleOsc) return;
    try {
      this.rumbleOsc.stop();
      this.rumbleOsc.disconnect();
      if (this.rumbleGain) this.rumbleGain.disconnect();
    } catch (_e) {}
    this.rumbleOsc = null;
    this.rumbleGain = null;
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.saveMutePreference();
    this.syncToggleUI();
    if (this.isMuted) {
      this.silenceImmediately();
    } else {
      this.ensureContext();
    }
  }
};

/* ============================================================================
   4. SAFE DOM CONTENT RENDERING (No innerHTML with dynamic text)
   ============================================================================ */

function getInitials(nameStr) {
  const cleaned = String(nameStr || 'FK').trim();
  if (!cleaned) return 'FK';
  if (cleaned.toLowerCase() === 'farsky') return 'FK';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (cleaned[0] + cleaned[cleaned.length - 1]).toUpperCase();
}

function isPlaceholderEmail(emailStr) {
  if (!emailStr) return true;
  const trimmed = String(emailStr).trim();
  return (
    trimmed === '[YOUR_EMAIL]' ||
    trimmed.startsWith('[') ||
    !trimmed.includes('@') ||
    !trimmed.includes('.')
  );
}

function renderContent() {
  document.title = `${CONTENT.name} | ${CONTENT.title}`;

  const initials = getInitials(CONTENT.name);

  // Navigation & ID Card Badge text
  const navBrand = document.getElementById('nav-brand-name');
  if (navBrand) navBrand.textContent = CONTENT.name;

  const badgeName = document.getElementById('badge-name');
  if (badgeName) badgeName.textContent = CONTENT.name;

  const badgeRole = document.getElementById('badge-role');
  if (badgeRole) badgeRole.textContent = CONTENT.title;

  const dockedName = document.getElementById('docked-badge-name');
  if (dockedName) dockedName.textContent = CONTENT.name;

  const dockedRole = document.getElementById('docked-badge-role');
  if (dockedRole) dockedRole.textContent = CONTENT.title;

  const badgeInitials = document.getElementById('badge-avatar-initials');
  if (badgeInitials) badgeInitials.textContent = initials;

  // Hero text fields
  const heroTopLine = document.getElementById('hero-topline');
  if (heroTopLine) heroTopLine.textContent = CONTENT.topLine;

  const heroName = document.getElementById('hero-name');
  if (heroName) heroName.textContent = CONTENT.name;

  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) heroTitle.textContent = CONTENT.title;

  const svgAvatarText = document.querySelector('#hero-svg-avatar svg text:last-of-type');
  if (svgAvatarText) svgAvatarText.textContent = initials;

  // About section
  const specCallsign = document.getElementById('spec-callsign');
  if (specCallsign) specCallsign.textContent = CONTENT.name;

  const aboutText = document.getElementById('about-text');
  if (aboutText) aboutText.textContent = CONTENT.about;

  // Projects section
  const projectsGrid = document.getElementById('projects-grid');
  if (projectsGrid && Array.isArray(CONTENT.projects)) {
    while (projectsGrid.firstChild) {
      projectsGrid.removeChild(projectsGrid.firstChild);
    }

    CONTENT.projects.forEach((proj, index) => {
      const slotNumber = String(index + 1).padStart(2, '0');
      const hasUrl = Boolean(proj.url && String(proj.url).trim().length > 0);

      const card = document.createElement('article');
      card.className = 'project-card';
      card.setAttribute('data-tags', Array.isArray(proj.tags) ? proj.tags.join(',') : '');
      if (index === 0) card.classList.add('project-card--featured');
      if (!hasUrl) {
        card.classList.add('project-card--static');
        card.setAttribute('tabindex', '0');
      }
      card.setAttribute('data-build-target', `card.${slotNumber}`);
      card.setAttribute('data-build-label', `card.${slotNumber}`);

      const topRow = document.createElement('div');
      topRow.className = 'project-card__top';

      const indexSpan = document.createElement('span');
      indexSpan.className = 'project-card__index';
      indexSpan.textContent = `spec // ${slotNumber}`;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'project-card__status';
      statusSpan.textContent = hasUrl ? 'Live project' : 'Coming soon';

      topRow.appendChild(indexSpan);
      topRow.appendChild(statusSpan);

      const titleEl = document.createElement('h3');
      titleEl.className = 'project-card__title';
      titleEl.textContent = proj.title || `Project ${slotNumber}`;

      const blurbEl = document.createElement('p');
      blurbEl.className = 'project-card__blurb';
      blurbEl.textContent = proj.blurb || '';

      const bottomRow = document.createElement('div');
      bottomRow.className = 'project-card__bottom';

      const tagsList = document.createElement('ul');
      tagsList.className = 'project-card__tags';
      tagsList.setAttribute('aria-label', 'Technologies used');

      if (Array.isArray(proj.tags)) {
        proj.tags.forEach((tagText) => {
          const li = document.createElement('li');
          li.className = 'project-card__tag';
          li.textContent = String(tagText);
          tagsList.appendChild(li);
        });
      }

      const cursorChip = document.createElement('span');
      cursorChip.className = 'project-card__cursor-chip';
      cursorChip.setAttribute('aria-hidden', 'true');
      cursorChip.textContent = hasUrl
        ? `open // ${proj.title.toLowerCase()}`
        : `slot.${slotNumber} // pending url`;

      bottomRow.appendChild(tagsList);
      bottomRow.appendChild(cursorChip);

      if (hasUrl) {
        const link = document.createElement('a');
        link.className = 'project-card__link';
        link.href = String(proj.url).trim();
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `${proj.title} - open project in new tab`);

        link.appendChild(topRow);
        link.appendChild(titleEl);
        link.appendChild(blurbEl);
        link.appendChild(bottomRow);
        card.appendChild(link);
      } else {
        card.appendChild(topRow);
        card.appendChild(titleEl);
        card.appendChild(blurbEl);
        card.appendChild(bottomRow);
      }

      projectsGrid.appendChild(card);
    });
  }

  // Contact email
  const emailActionsRow = document.getElementById('contact-email-actions');
  if (emailActionsRow) {
    while (emailActionsRow.firstChild) {
      emailActionsRow.removeChild(emailActionsRow.firstChild);
    }

    if (isPlaceholderEmail(CONTENT.email)) {
      const plainSpan = document.createElement('span');
      plainSpan.id = 'contact-email-placeholder';
      plainSpan.className = 'contact-email-box__placeholder';
      plainSpan.textContent = CONTENT.email;

      const noteTag = document.createElement('span');
      noteTag.id = 'contact-email-note';
      noteTag.className = 'mono-tag';
      noteTag.textContent = 'placeholder // edit in script.js';

      emailActionsRow.appendChild(plainSpan);
      emailActionsRow.appendChild(noteTag);
    } else {
      const cleanEmail = String(CONTENT.email).trim();

      const mailLink = document.createElement('a');
      mailLink.className = 'contact-email-box__link';
      mailLink.href = `mailto:${cleanEmail}`;
      mailLink.textContent = cleanEmail;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn--secondary';
      copyBtn.textContent = 'Copy email';
      copyBtn.setAttribute('aria-label', `Copy email address ${cleanEmail}`);

      const feedbackBubble = document.createElement('span');
      feedbackBubble.className = 'copy-feedback-bubble';
      feedbackBubble.setAttribute('role', 'status');
      feedbackBubble.setAttribute('aria-live', 'polite');

      let copyTimerId = null;
      let lastAnnouncement = '';

      copyBtn.addEventListener('click', async () => {
        clearTimeout(copyTimerId);
        let message = '';
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error('Clipboard API unavailable');
          }
          await navigator.clipboard.writeText(cleanEmail);
          message = 'Email copied to clipboard';
        } catch (_err) {
          message = 'Copy failed - select address manually';
        }

        if (message === lastAnnouncement) {
          message += '\u00A0';
        }
        lastAnnouncement = message;

        feedbackBubble.textContent = message;
        feedbackBubble.classList.add('is-visible');

        copyTimerId = setTimeout(() => {
          feedbackBubble.classList.remove('is-visible');
          feedbackBubble.textContent = '';
        }, 2600);
      });

      emailActionsRow.appendChild(mailLink);
      emailActionsRow.appendChild(copyBtn);
      emailActionsRow.appendChild(feedbackBubble);
    }
  }

  // Contact socials
  const socialsWrap = document.getElementById('contact-socials-wrap');
  const socialsList = document.getElementById('contact-socials-list');
  if (socialsWrap && socialsList) {
    while (socialsList.firstChild) {
      socialsList.removeChild(socialsList.firstChild);
    }

    const validSocials = Array.isArray(CONTENT.socials)
      ? CONTENT.socials.filter((item) => item && item.label && item.url && String(item.url).trim().length > 0)
      : [];

    if (validSocials.length > 0) {
      validSocials.forEach((social) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'btn btn--secondary';
        a.href = String(social.url).trim();
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = String(social.label).trim();
        li.appendChild(a);
        socialsList.appendChild(li);
      });
      socialsWrap.hidden = false;
    } else {
      socialsWrap.hidden = true;
    }
  }

  const footerOwner = document.getElementById('footer-owner-name');
  if (footerOwner) footerOwner.textContent = CONTENT.name;
}

/* ============================================================================
   5. SYSTEM EVOLUTION INTRO: 2005 LEGACY SITE -> 3D CSS BLACK HOLE -> BUILD
   ============================================================================ */

const introController = {
  introLayer: null,
  legacySite: null,
  blackHole: null,
  blackHoleHint: null,
  flashEl: null,
  skipBtn: null,
  legacyTimer: null,
  activeTween: null,
  reducedMotionQuery: window.matchMedia('(prefers-reduced-motion: reduce)'),
  isReducedMotion: false
};

/**
 * Transitions cleanly to the LIVE state (used by "Skip to new site", Escape,
 * reduced-motion mode, and at the end of the AI cursor build).
 */
function enterLiveState(options = {}) {
  const { immediate = false } = options;
  if (currentState === STATES.LIVE) return;

  const c = introController;

  // 1. Kill any active intro timers, tweens, and sub-bass rumble
  clearTimeout(c.legacyTimer);
  if (c.activeTween) {
    c.activeTween.kill();
    c.activeTween = null;
  }
  soundEngine.stopBlackHoleRumble();
  soundEngine.stopStretch();

  if (typeof cleanupBuildStage === 'function') {
    cleanupBuildStage();
  }

  currentState = STATES.LIVE;

  // 2. Unlock page scroll and reveal the final site wrapper & all targets
  document.documentElement.classList.remove('is-locked-scroll', 'js-intro-active', 'js-build-pending');
  document.documentElement.style.scrollBehavior = '';
  window.scrollTo({ top: 0, behavior: 'auto' });

  document.querySelectorAll('[data-build-target]').forEach((el) => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.transform = '';
    el.classList.add('is-placed');
  });

  if (c.skipBtn && c.skipBtn.parentNode) {
    c.skipBtn.remove();
  }

  const finishCleanup = () => {
    if (c.legacySite && c.legacySite.parentNode) {
      c.legacySite.remove();
    }
    if (c.introLayer && c.introLayer.parentNode) {
      c.introLayer.remove();
    }
    announceToScreenReader('Site ready');

    const mainHeading = document.getElementById('hero-name');
    if (mainHeading) {
      mainHeading.focus({ preventScroll: true });
    }

    if (typeof startLiveMotion === 'function') {
      startLiveMotion();
    }
  };

  if (immediate || typeof window.gsap === 'undefined') {
    finishCleanup();
  } else if (c.introLayer && c.introLayer.parentNode) {
    const fadeSec = c.isReducedMotion ? CONFIG.reducedMotionFadeMs / 1000 : 0.25;
    window.gsap.to(c.introLayer, {
      opacity: 0,
      duration: fadeSec,
      ease: 'power2.out',
      onComplete: finishCleanup
    });
  } else {
    finishCleanup();
  }
}

/**
 * ============================================================================
 * 5B. STEP 4: WIDTH-LOCKED SCRAMBLE TEXT (ZERO LAYOUT SHIFT)
 * ============================================================================
 * How it works (for beginners):
 * - Before scrambling starts, we wrap each character in a <span> (grouped in
 *   white-space: nowrap word spans so line breaks never shift mid-scramble).
 * - We batch-measure every character span's exact pixel width ONCE, then lock
 *   each span to that exact width so random glyphs never push neighbors around.
 * - The scrambled visual layer is aria-hidden="true" while the parent element
 *   keeps aria-label set to the real final text for screen readers.
 * ============================================================================
 */
function prepareLockedScramble(el) {
  const finalText = el.textContent || '';
  el.setAttribute('aria-label', finalText);

  const lockedWidth = el.getBoundingClientRect().width;
  const lockedHeight = el.getBoundingClientRect().height;
  if (lockedHeight > 0) {
    el.style.minHeight = `${lockedHeight}px`;
  }
  if (lockedWidth > 0) {
    el.style.minWidth = `${Math.ceil(lockedWidth)}px`;
  }

  const visualWrap = document.createElement('span');
  visualWrap.setAttribute('aria-hidden', 'true');

  // Split into words and spaces so wrapping stays identical to the final text
  const tokens = finalText.split(/(\s+)/);
  const charEntries = [];

  tokens.forEach((token) => {
    if (!token) return;
    if (/^\s+$/.test(token)) {
      visualWrap.appendChild(document.createTextNode(token));
      return;
    }

    const wordSpan = document.createElement('span');
    wordSpan.className = 'scramble-word';

    for (const ch of token) {
      const charSpan = document.createElement('span');
      charSpan.className = 'scramble-char';
      charSpan.textContent = ch;
      wordSpan.appendChild(charSpan);
      charEntries.push({ span: charSpan, finalChar: ch, delay: Math.random() * 0.16 });
    }
    visualWrap.appendChild(wordSpan);
  });

  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(visualWrap);

  // Batch-read all character widths BEFORE writing any inline width
  const measuredWidths = charEntries.map((entry) => entry.span.getBoundingClientRect().width);
  charEntries.forEach((entry, idx) => {
    const w = measuredWidths[idx];
    if (w > 0) {
      entry.span.style.width = `${w}px`;
    }
  });

  return {
    finalText,
    charEntries,
    cleanup() {
      el.textContent = finalText;
      el.style.minHeight = '';
      el.style.minWidth = '';
    }
  };
}

function animateLockedScramble(el, durationSec) {
  if (introController.isReducedMotion || typeof window.gsap === 'undefined') {
    return null;
  }

  const state = prepareLockedScramble(el);
  const glyphs = CONFIG.scrambleGlyphs;
  const total = state.charEntries.length;
  const progressProxy = { p: 0 };

  return window.gsap.to(progressProxy, {
    p: 1,
    duration: durationSec,
    ease: 'none',
    onUpdate: () => {
      const p = progressProxy.p;
      for (let i = 0; i < total; i++) {
        const entry = state.charEntries[i];
        const threshold = (i / Math.max(1, total)) * 0.84 + entry.delay;
        if (p >= threshold) {
          entry.span.textContent = entry.finalChar;
        } else {
          entry.span.textContent = glyphs[(Math.random() * glyphs.length) | 0];
        }
      }
    },
    onComplete: () => {
      state.cleanup();
    }
  });
}

/* ============================================================================
   5C. STEP 4: AI AGENT CURSOR & BUILD CHOREOGRAPHY
   ============================================================================ */
const buildController = {
  overlay: null,
  canvas: null,
  ctx: null,
  selectionBox: null,
  cursorEl: null,
  cursorChip: null,
  cursorArrow: null,
  cursorRipple: null,
  timeline: null,
  trailPoints: [],
  cursorX: 0,
  cursorY: 0,
  dpr: 1,
  tickerBound: null,
  activeScrambles: []
};

function cleanupBuildStage() {
  const b = buildController;
  if (b.timeline) {
    b.timeline.kill();
    b.timeline = null;
  }
  b.activeScrambles.forEach((tw) => tw && tw.kill());
  b.activeScrambles = [];

  if (b.tickerBound && typeof window.gsap !== 'undefined') {
    window.gsap.ticker.remove(b.tickerBound);
    b.tickerBound = null;
  }

  if (b.overlay && b.overlay.parentNode) {
    b.overlay.remove();
  }
  b.trailPoints = [];
}

function drawCursorTrailTick() {
  const b = buildController;
  if (!b.ctx || !b.canvas || currentState !== STATES.BUILD && currentState !== STATES.HANDOFF) return;

  const isMobile = window.innerWidth <= 768;
  const maxTrail = isMobile ? 7 : 13;

  b.trailPoints.push({ x: b.cursorX, y: b.cursorY });
  if (b.trailPoints.length > maxTrail) {
    b.trailPoints.shift();
  }

  b.ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);

  // Draw fading crimson/bone trailing dots behind the AI cursor
  for (let i = 0; i < b.trailPoints.length - 1; i++) {
    const pt = b.trailPoints[i];
    const ratio = (i + 1) / b.trailPoints.length;
    b.ctx.beginPath();
    b.ctx.arc(pt.x * b.dpr, pt.y * b.dpr, (isMobile ? 2.2 : 3.2) * ratio * b.dpr, 0, Math.PI * 2);
    b.ctx.fillStyle = `rgba(245, 243, 238, ${(ratio * 0.38).toFixed(3)})`;
    b.ctx.fill();
  }

  // Position the literal SVG arrow tip at exact (cursorX, cursorY)
  if (b.cursorEl) {
    b.cursorEl.style.transform = `translate3d(${b.cursorX.toFixed(1)}px, ${b.cursorY.toFixed(1)}px, 0)`;
  }
}

function showSelectionBoxForRect(rect, labelText) {
  const b = buildController;
  if (!b.selectionBox) return;
  const pad = 4;
  b.selectionBox.hidden = false;
  b.selectionBox.style.width = `${Math.round(rect.width + pad * 2)}px`;
  b.selectionBox.style.height = `${Math.round(rect.height + pad * 2)}px`;
  b.selectionBox.style.transform = `translate3d(${Math.round(rect.left - pad)}px, ${Math.round(rect.top - pad)}px, 0)`;
  window.gsap.fromTo(b.selectionBox, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: 'power1.out' });

  if (b.cursorChip && labelText) {
    b.cursorChip.textContent = labelText;
  }
}

function hideSelectionBox() {
  const b = buildController;
  if (!b.selectionBox) return;
  window.gsap.to(b.selectionBox, {
    opacity: 0,
    duration: 0.16,
    ease: 'power1.out',
    onComplete: () => {
      if (b.selectionBox) b.selectionBox.hidden = true;
    }
  });
}

function startAiBuildChoreography() {
  const b = buildController;
  if (introController.isReducedMotion || typeof window.gsap === 'undefined') {
    enterLiveState({ immediate: false });
    return;
  }

  currentState = STATES.BUILD;
  // Remove overflow:hidden during BUILD and force instant scroll so getBoundingClientRect() is exact
  document.documentElement.classList.remove('is-locked-scroll');
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo({ top: 0, behavior: 'instant' });

  b.overlay = document.getElementById('build-overlay');
  b.canvas = document.getElementById('cursor-trail-canvas');
  b.selectionBox = document.getElementById('selection-box');
  b.cursorEl = document.getElementById('ai-cursor');
  b.cursorChip = document.getElementById('ai-cursor-chip');
  b.cursorArrow = b.cursorEl ? b.cursorEl.querySelector('.ai-cursor__arrow') : null;
  b.cursorRipple = b.cursorEl ? b.cursorEl.querySelector('.ai-cursor__ripple') : null;

  if (!b.overlay || !b.canvas || !b.cursorEl) {
    enterLiveState({ immediate: true });
    return;
  }

  // Cap DPR at 2 for crisp rendering with low mobile GPU cost (Section 14)
  b.dpr = Math.min(2, window.devicePixelRatio || 1);
  b.canvas.width = Math.round(window.innerWidth * b.dpr);
  b.canvas.height = Math.round(window.innerHeight * b.dpr);
  b.ctx = b.canvas.getContext('2d');

  b.overlay.hidden = false;
  // Spawn AI Agent Cursor directly from the center of the Black Hole singularity
  b.cursorX = window.innerWidth * 0.5;
  b.cursorY = window.innerHeight * 0.5;
  b.trailPoints = [];

  b.tickerBound = drawCursorTrailTick;
  window.gsap.ticker.add(b.tickerBound);

  const isMobile = window.innerWidth <= 768;
  const travelDur = isMobile ? CONFIG.buildStepMobileSec : CONFIG.buildStepTravelSec;

  // Dynamic choreography array read from real DOM targets in exact top-to-bottom order
  const steps = isMobile
    ? [
        { target: '[data-build-target="nav"]', label: '00 // nav', reveal: 'drop' },
        { target: '[data-build-target="hero.topline"]', label: '01 // identity', reveal: 'drop' },
        { target: '[data-build-target="hero.name"]', label: '02 // hero.name', reveal: 'scramble' },
        { target: '[data-build-target="hero.visual"]', label: '03 // lucifer', reveal: 'drop' },
        { target: '[data-build-target="hero.title"]', label: '04 // role', reveal: 'scramble' },
        { target: '#about-text', label: '05 // about', reveal: 'drop' },
        { target: '[data-build-target="about.contrib"]', label: '06 // github.activity', reveal: 'drop' },
        { target: '[data-build-target="section.skills"]', label: '07 // skills', reveal: 'drop' },
        { target: '[data-build-target="card.01"], [data-build-target="card.02"], [data-build-target="card.03"]', label: '08 // projects', reveal: 'stagger' },
        { target: '#contact-email-box', label: '09 // dispatch', reveal: 'drop' },
        { target: '[data-build-target="contact.badge"]', label: '10 // id.badge', reveal: 'drop' },
        { target: '[data-build-target="footer"]', label: '11 // footer', reveal: 'drop' }
      ]
    : [
        { target: '[data-build-target="nav"]', label: '00 // nav', reveal: 'drop' },
        { target: '[data-build-target="hero.topline"]', label: '01 // identity', reveal: 'drop' },
        { target: '[data-build-target="hero.name"]', label: '02 // hero.name', reveal: 'scramble' },
        { target: '[data-build-target="hero.visual"]', label: '03 // lucifer', reveal: 'drop' },
        { target: '[data-build-target="hero.title"]', label: '04 // role', reveal: 'scramble' },
        { target: '#about-text', label: '05 // about', reveal: 'drop' },
        { target: '[data-build-target="about.contrib"]', label: '06 // github.activity', reveal: 'drop' },
        { target: '[data-build-target="section.skills"]', label: '07 // skills', reveal: 'drop' },
        { target: '[data-build-target="card.01"]', label: '08 // project.01', reveal: 'drop' },
        { target: '[data-build-target="card.02"]', label: '09 // project.02', reveal: 'drop' },
        { target: '[data-build-target="card.03"]', label: '10 // project.03', reveal: 'drop' },
        { target: '#contact-email-box', label: '11 // dispatch', reveal: 'drop' },
        { target: '[data-build-target="contact.badge"]', label: '12 // id.badge', reveal: 'drop' },
        { target: '[data-build-target="footer"]', label: '13 // footer', reveal: 'drop' }
      ];

  let stepIndex = 0;

  function getCursorTargetPoint(rect) {
    const x = Math.max(16, Math.min(window.innerWidth - 28, rect.left + Math.min(rect.width * 0.35, 110)));
    const y = Math.max(16, Math.min(window.innerHeight - 28, rect.top + Math.min(rect.height * 0.38, 44)));
    return { x, y };
  }

  function runNextStep() {
    if (currentState !== STATES.BUILD) return;

    if (stepIndex >= steps.length) {
      document.documentElement.style.scrollBehavior = '';
      triggerBuildHandoff();
      return;
    }

    const step = steps[stepIndex++];
    const elements = Array.from(document.querySelectorAll(step.target));
    if (elements.length === 0) {
      runNextStep();
      return;
    }

    const primaryEl = elements[0];
    let rect = primaryEl.getBoundingClientRect();

    // Scroll target cleanly into the upper-middle viewport synchronously BEFORE measuring
    if (rect.top > window.innerHeight * 0.72 || rect.bottom < 72) {
      const targetScrollTop = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.34);
      window.scrollTo({ top: targetScrollTop, behavior: 'instant' });
      rect = primaryEl.getBoundingClientRect();
    }

    // Aim the literal arrow tip at the element's top-left-to-center handle
    const { x: destX, y: destY } = getCursorTargetPoint(rect);

    const startX = b.cursorX;
    const startY = b.cursorY;
    const ctrlX = (startX + destX) * 0.5 + (stepIndex % 2 === 0 ? 32 : -32);
    const ctrlY = (startY + destY) * 0.5 - 20;

    const moveProxy = { t: 0 };
    const tl = window.gsap.timeline({
      onComplete: () => {
        b.timeline = null;
        runNextStep();
      }
    });
    b.timeline = tl;

    if (b.cursorChip) b.cursorChip.textContent = step.label;

    // 1. Curved path travel so the arrow tip lands directly on the target
    tl.to(moveProxy, {
      t: 1,
      duration: travelDur,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = moveProxy.t;
        const u = 1 - t;
        b.cursorX = u * u * startX + 2 * u * t * ctrlX + t * t * destX;
        b.cursorY = u * u * startY + 2 * u * t * ctrlY + t * t * destY;
      }
    });

    // 2. Micro-click scale + draw exact selection box + place element(s)
    tl.add(() => {
      const freshRect = primaryEl.getBoundingClientRect();
      const lockedPt = getCursorTargetPoint(freshRect);
      b.cursorX = lockedPt.x;
      b.cursorY = lockedPt.y;
      if (b.cursorEl) {
        b.cursorEl.style.transform = `translate3d(${b.cursorX.toFixed(1)}px, ${b.cursorY.toFixed(1)}px, 0)`;
      }
      showSelectionBoxForRect(freshRect, step.label);

      if (b.cursorArrow) {
        window.gsap.fromTo(b.cursorArrow, { scale: 0.84 }, { scale: 1, duration: 0.16, ease: 'power2.out' });
      }

      elements.forEach((el, idx) => {
        el.classList.add('is-placed');
        if (step.reveal === 'scramble') {
          window.gsap.fromTo(
            el,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' }
          );
          const scr = animateLockedScramble(el, isMobile ? 0.45 : 0.62);
          if (scr) b.activeScrambles.push(scr);
        } else {
          window.gsap.fromTo(
            el,
            { opacity: 0, y: 12 },
            {
              opacity: 1,
              y: 0,
              duration: 0.34,
              delay: step.reveal === 'stagger' ? idx * 0.08 : 0,
              ease: 'power3.out'
            }
          );
        }
      });
    }, `+=${isMobile ? 0.03 : 0.05}`);

    tl.to({}, { duration: step.reveal === 'scramble' ? (isMobile ? 0.34 : 0.48) : (isMobile ? 0.20 : 0.26) });
    tl.add(() => hideSelectionBox());
  }

  runNextStep();
}

function triggerBuildHandoff() {
  const b = buildController;
  if (currentState !== STATES.BUILD) return;
  currentState = STATES.HANDOFF;

  const neutralX = window.innerWidth * 0.5;
  const neutralY = window.innerHeight * 0.42;
  const startX = b.cursorX;
  const startY = b.cursorY;
  const moveProxy = { t: 0 };

  if (b.cursorChip) b.cursorChip.textContent = 'handoff // ready';

  const tl = window.gsap.timeline({
    onComplete: () => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      enterLiveState({ immediate: true });
    }
  });
  b.timeline = tl;

  tl.to(moveProxy, {
    t: 1,
    duration: 0.30,
    ease: 'power2.out',
    onUpdate: () => {
      b.cursorX = startX + (neutralX - startX) * moveProxy.t;
      b.cursorY = startY + (neutralY - startY) * moveProxy.t;
    }
  });

  if (b.cursorArrow && b.cursorRipple) {
    tl.to(b.cursorArrow, { scale: 0.78, duration: 0.09, ease: 'power2.in' });
    tl.to(b.cursorArrow, { scale: 1.05, duration: 0.14, ease: 'power2.out' });
    tl.fromTo(
      b.cursorRipple,
      { opacity: 0.9, scale: 0.4 },
      { opacity: 0, scale: 2.1, duration: 0.36, ease: 'power2.out' },
      '<'
    );
  }

  tl.to(b.overlay, { opacity: 0, duration: 0.24, ease: 'power2.out' });
}

/**
 * Stage 4: Collapses the Black Hole into a blinding flash, removes #legacy-site
 * and #intro-layer from the DOM, and spawns the AI Agent Cursor from the singularity.
 */
function collapseSingularityIntoBuild() {
  const c = introController;
  if (currentState !== STATES.CONSUMING) return;

  // Abruptly cut off the sub-bass rumble as the old site is deleted
  soundEngine.stopBlackHoleRumble();

  if (c.legacySite && c.legacySite.parentNode) {
    c.legacySite.remove();
  }

  // Prepare hidden build targets BEFORE removing js-intro-active so zero elements flash
  if (!c.isReducedMotion) {
    document.documentElement.classList.add('js-build-pending');
  }

  const tl = window.gsap.timeline({
    onComplete: () => {
      c.activeTween = null;
      document.documentElement.classList.remove('js-intro-active');
      if (c.skipBtn && c.skipBtn.parentNode) {
        c.skipBtn.remove();
      }
      if (c.introLayer && c.introLayer.parentNode) {
        c.introLayer.remove();
      }
      startAiBuildChoreography();
    }
  });
  c.activeTween = tl;

  if (c.blackHole) {
    tl.to(c.blackHole, {
      scale: 0.02,
      opacity: 0,
      duration: 0.22,
      ease: 'power4.in'
    }, 0);
  }

  if (c.flashEl) {
    tl.to(c.flashEl, {
      opacity: 1,
      duration: 0.12,
      ease: 'power2.in'
    }, 0.12);
    tl.to(c.flashEl, {
      opacity: 0,
      duration: 0.34,
      ease: 'power2.out'
    }, 0.24);
  }
}

/**
 * Stage 3 (CONSUMING): Violently pulls all 2005 legacy elements into the center
 * of the Black Hole with glitch distortion, rotation, and stretch.
 */
function consumeLegacySiteIntoBlackHole() {
  const c = introController;
  if (currentState !== STATES.SINGULARITY) return;

  currentState = STATES.CONSUMING;
  announceToScreenReader('Black hole consuming legacy website');

  if (c.activeTween) {
    c.activeTween.kill();
    c.activeTween = null;
  }

  if (c.blackHoleHint) {
    c.blackHoleHint.textContent = 'EVENT HORIZON // CONSUMING LEGACY WEB';
  }

  const centerX = window.innerWidth * 0.5;
  const centerY = window.innerHeight * 0.5;
  const chunks = c.legacySite
    ? Array.from(c.legacySite.querySelectorAll('.legacy-chunk'))
    : [];

  const tl = window.gsap.timeline({
    onComplete: () => {
      c.activeTween = null;
      collapseSingularityIntoBuild();
    }
  });
  c.activeTween = tl;

  // Swell the Black Hole as it feeds on the old web
  if (c.blackHole) {
    tl.to(c.blackHole, {
      scale: 1.45,
      duration: 1.15,
      ease: 'power2.inOut'
    }, 0);
  }

  // Pull each legacy HTML chunk into the center with glitch, spin, and stretch
  chunks.forEach((chunk, idx) => {
    chunk.classList.add('is-glitching');
    const r = chunk.getBoundingClientRect();
    const dx = centerX - (r.left + r.width * 0.5);
    const dy = centerY - (r.top + r.height * 0.5);
    const spin = (idx % 2 === 0 ? 1 : -1) * (160 + idx * 28);

    tl.to(chunk, {
      x: dx,
      y: dy,
      rotation: spin,
      scaleX: 0.04,
      scaleY: 0.04,
      opacity: 0,
      duration: 0.78,
      ease: 'power3.in'
    }, idx * 0.055);
  });

  // Pull and collapse the entire #legacy-site container into the singularity
  if (c.legacySite) {
    tl.to(c.legacySite, {
      scale: 0,
      rotation: -45,
      opacity: 0,
      duration: 0.92,
      ease: 'power3.in'
    }, 0.22);
  }
}

/**
 * Stage 2 (SINGULARITY): Spawns the glowing speck in the center of the screen
 * and expands it into the swirling CSS Black Hole while starting the sub-bass rumble.
 */
function spawnBlackHoleAnomaly() {
  const c = introController;
  if (currentState !== STATES.LEGACY) return;

  if (c.isReducedMotion) {
    enterLiveState({ immediate: false });
    return;
  }

  currentState = STATES.SINGULARITY;
  clearTimeout(c.legacyTimer);
  announceToScreenReader('Singularity anomaly detected');

  // Start Web Audio sub-bass rumble (plays immediately if user already interacted)
  soundEngine.startBlackHoleRumble(2.3);

  if (!c.blackHole || typeof window.gsap === 'undefined') {
    enterLiveState({ immediate: true });
    return;
  }

  // Appear as a tiny glowing speck first, then rapidly expand into the Black Hole
  window.gsap.set(c.blackHole, { scale: 0.08, opacity: 1 });

  c.activeTween = window.gsap.to(c.blackHole, {
    scale: 1,
    opacity: 1,
    duration: 0.95,
    ease: 'back.out(1.35)',
    onComplete: () => {
      c.activeTween = null;
      consumeLegacySiteIntoBlackHole();
    }
  });
}

/**
 * Initializes the System Evolution Intro (LEGACY -> SINGULARITY -> CONSUMING -> BUILD -> LIVE).
 */
function initIntroCardAndLanyard() {
  const c = introController;
  c.introLayer = document.getElementById('intro-layer');
  c.legacySite = document.getElementById('legacy-site');
  c.blackHole = document.getElementById('black-hole');
  c.blackHoleHint = document.getElementById('black-hole-hint');
  c.flashEl = document.getElementById('singularity-flash');
  c.skipBtn = document.getElementById('skip-intro-btn');

  if (typeof window.gsap === 'undefined' || !c.introLayer || !c.legacySite) {
    currentState = STATES.LIVE;
    document.documentElement.classList.remove('js-intro-active', 'is-locked-scroll');
    return;
  }

  c.isReducedMotion = c.reducedMotionQuery.matches;
  soundEngine.loadMutePreference(c.isReducedMotion);

  // Activate intro overlay and lock background scroll
  document.documentElement.classList.add('js-intro-active', 'is-locked-scroll');
  currentState = STATES.LEGACY;

  // "Skip to new site" button in bottom-right corner
  if (c.skipBtn) {
    c.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterLiveState({ immediate: true });
    });
  }

  // Allow Escape key to jump cleanly to LIVE at any state
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentState !== STATES.LIVE) {
      enterLiveState({ immediate: true });
    }
  });

  // Unlock Web Audio on any click/touch inside the intro and let user trigger/accelerate the Black Hole
  c.introLayer.addEventListener('pointerdown', (e) => {
    if (c.skipBtn && c.skipBtn.contains(e.target)) return;
    soundEngine.ensureContext();
    if (currentState === STATES.LEGACY) {
      spawnBlackHoleAnomaly();
    } else if (currentState === STATES.SINGULARITY) {
      consumeLegacySiteIntoBlackHole();
    }
  });

  if (c.blackHole) {
    c.blackHole.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        soundEngine.ensureContext();
        if (currentState === STATES.LEGACY) {
          spawnBlackHoleAnomaly();
        } else if (currentState === STATES.SINGULARITY) {
          consumeLegacySiteIntoBlackHole();
        }
      }
    });
  }

  // Automatically spawn the Black Hole anomaly after 2.5 seconds of viewing the 2005 site
  c.legacyTimer = setTimeout(() => {
    if (currentState === STATES.LEGACY) {
      spawnBlackHoleAnomaly();
    }
  }, 2500);

  // Pause/resume during tab visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      soundEngine.silenceImmediately();
      if (buildController.timeline) buildController.timeline.pause();
    } else if (currentState !== STATES.LIVE) {
      if (buildController.timeline) buildController.timeline.resume();
    }
  });
}

/* ============================================================================
   6. CHARACTER CUTOUT & GENERATED SVG AVATAR SWITCHER / FALLBACK (HERO)
   ============================================================================ */
function initAvatarFallback() {
  const charImg = document.getElementById('hero-character-img');
  const svgWrap = document.getElementById('hero-svg-avatar');
  if (!charImg || !svgWrap) return;

  charImg.addEventListener('error', () => {
    charImg.hidden = true;
    svgWrap.hidden = false;
  });
}

/* ============================================================================
   7. PROJECT CARD CURSOR-REACTIVE 3D TILT (Batched Reads Before Writes)
   ============================================================================ */
function initProjectCardTilt() {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  const cards = document.querySelectorAll('.project-card, #docked-id-card');
  cards.forEach((card) => {
    let cachedRect = null;

    function resetTilt() {
      cachedRect = null;
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--glare-x', '34%');
      card.style.setProperty('--glare-y', '78%');
      card.style.setProperty('--glare-opacity', '0.45');
    }

    card.addEventListener('pointerenter', () => {
      if (reducedMotionQuery.matches || !finePointerQuery.matches) return;
      cachedRect = card.getBoundingClientRect();
      card.style.setProperty('--glare-opacity', '0.78');
    });

    card.addEventListener('pointermove', (event) => {
      if (!cachedRect || reducedMotionQuery.matches || !finePointerQuery.matches) return;
      const relX = (event.clientX - cachedRect.left) / cachedRect.width - 0.5;
      const relY = (event.clientY - cachedRect.top) / cachedRect.height - 0.5;

      const tiltX = (-relY * CONFIG.cardMaxTiltDeg * 2).toFixed(2);
      const tiltY = (relX * CONFIG.cardMaxTiltDeg * 2).toFixed(2);

      card.style.setProperty('--tilt-x', `${tiltX}deg`);
      card.style.setProperty('--tilt-y', `${tiltY}deg`);
      card.style.setProperty('--glare-x', `${((relX + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--glare-y', `${((relY + 0.5) * 100).toFixed(1)}%`);
    });

    card.addEventListener('pointerleave', resetTilt);
    card.addEventListener('blur', resetTilt);
  });

  reducedMotionQuery.addEventListener('change', () => {
    if (reducedMotionQuery.matches) {
      cards.forEach((card) => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    }
  });
}

/* ============================================================================
   7B. STEP 5: DEVTOOLS EASTER EGG (Printed once on load inside try/catch)
   ============================================================================ */
let easterEggPrinted = false;

function printDevToolsEasterEgg() {
  if (easterEggPrinted) return;
  easterEggPrinted = true;
  try {
    const emailText = CONTENT.email || '[YOUR_EMAIL]';
    console.log(
      `%cYou found the backend. I like you already. Let's talk: ${emailText}`,
      'background:#0D0D0C;color:#FF5B2E;border:1px solid #FF5B2E;padding:8px 14px;font-family:monospace;font-size:13px;font-weight:bold;border-radius:4px;'
    );
  } catch (_err) {
    // Ignore in restricted console environments
  }
}

/* ============================================================================
   7C. ONGOING LIVE MOTION: AMBIENT PARTICLES, VELOCITY MARQUEE, PARALLAX & INTERACTIVE CONTROLS
   ============================================================================ */
let liveMotionStarted = false;

/**
 * Renders the GitHub public contribution calendar for @surockboyo using safe DOM APIs.
 * Data matches github.com/users/surockboyo/contributions (2025-11-23 to 2026-11-21).
 */
function renderGithubContributions() {
  const grid = document.getElementById('contrib-grid');
  const monthsEl = document.getElementById('contrib-months');
  const tooltipEl = document.getElementById('contrib-tooltip');
  if (!grid || !monthsEl) return;

  // Clear existing cells if re-run
  grid.textContent = '';
  monthsEl.textContent = '';

  // Verified public non-zero contribution dates for surockboyo (level 1-4)
  const activeDays = {
    '2026-06-01': 2,
    '2026-11-02': 4,
    '2026-11-18': 4
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startDate = new Date(Date.UTC(2025, 10, 23)); // 2025-11-23 (Sunday)
  const endDate = new Date(Date.UTC(2026, 10, 21));   // 2026-11-21

  let lastLabeledMonth = -1;
  let weekIndex = 0;

  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getUTCDay(); // 0 = Sun ... 6 = Sat
    const level = activeDays[iso] || 0;

    if (dayOfWeek === 0) {
      const m = d.getUTCMonth();
      if (m !== lastLabeledMonth) {
        const label = document.createElement('span');
        label.textContent = monthNames[m];
        label.style.gridColumn = String(weekIndex + 1);
        monthsEl.appendChild(label);
        lastLabeledMonth = m;
      }
      weekIndex += 1;
    }

    const cell = document.createElement('span');
    cell.className = 'contrib-cell';
    cell.setAttribute('data-level', String(level));
    cell.setAttribute('data-date', iso);
    cell.setAttribute('title', `${iso}: ${level > 0 ? 'Active public contribution day' : 'No public contributions'}`);
    cell.addEventListener('pointerenter', () => {
      if (tooltipEl) {
        tooltipEl.textContent = `${iso} // ${level > 0 ? 'Public GitHub contribution' : 'No public activity'}`;
      }
    });
    grid.appendChild(cell);
  }
}

function initContactCardLanyardDrag(dockedCard) {
  const wrap = dockedCard ? dockedCard.closest('.docked-badge-wrap') : null;
  const svg = document.getElementById('contact-lanyard-svg');
  const anchor = document.getElementById('contact-lanyard-anchor');
  const cord = document.getElementById('contact-lanyard-cord');
  const clasp = document.getElementById('contact-lanyard-clasp');
  if (!dockedCard || !wrap || !svg || !cord || !clasp) return;

  const state = {
    x: 0,
    y: 0,
    rot: 0,
    whip: 0,
    activePointerId: null,
    startX: 0,
    startY: 0,
    maxMovedPx: 0,
    tween: null,
    anchorX: 144,
    anchorY: 4,
    baseSlotY: 76
  };

  function measure() {
    const cardW = dockedCard.offsetWidth || 288;
    state.anchorX = dockedCard.offsetLeft + cardW * 0.5;
    state.anchorY = 4;
    state.baseSlotY = dockedCard.offsetTop || 76;
    if (anchor) {
      anchor.setAttribute('x', (state.anchorX - 16).toFixed(1));
      anchor.setAttribute('y', '0');
    }
  }

  function render() {
    dockedCard.style.setProperty('--drag-x', `${state.x.toFixed(2)}px`);
    dockedCard.style.setProperty('--drag-y', `${state.y.toFixed(2)}px`);
    dockedCard.style.setProperty('--drag-rot', `${state.rot.toFixed(2)}deg`);

    const rad = (state.rot * Math.PI) / 180;
    const slotX = state.anchorX + state.x + Math.sin(rad) * 14;
    const slotY = state.baseSlotY + state.y;

    const upSlack = state.y < 0 ? Math.min(1.8, Math.abs(state.y) / 68) : 0;
    const endY = slotY - 25;
    const bowX = state.x * 0.18 + state.whip;

    cord.setAttribute(
      'd',
      `M ${state.anchorX.toFixed(1)} ${state.anchorY.toFixed(1)} Q ${((state.anchorX + slotX) * 0.5 + bowX).toFixed(1)} ${((state.anchorY + endY) * 0.5 + upSlack * 28).toFixed(1)} ${slotX.toFixed(1)} ${endY.toFixed(1)}`
    );
    clasp.setAttribute(
      'transform',
      `translate(${slotX.toFixed(1)}, ${slotY.toFixed(1)}) rotate(${(state.rot * 0.5).toFixed(2)})`
    );
  }

  measure();
  render();
  window.addEventListener('resize', () => {
    measure();
    render();
  }, { passive: true });

  // Soft rubber-band with much longer travel (~420px) than intro lanyard
  function stretchAxis(raw, maxReach) {
    const sign = raw >= 0 ? 1 : -1;
    const abs = Math.abs(raw);
    return sign * (abs / (1 + abs / maxReach));
  }

  dockedCard.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!e.isPrimary || state.activePointerId !== null) return;

    if (state.tween) {
      state.tween.kill();
      state.tween = null;
    }

    measure();
    state.activePointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.maxMovedPx = 0;
    state.whip = 0;
    dockedCard.setPointerCapture(e.pointerId);
    dockedCard.classList.add('is-dragging');
  });

  dockedCard.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.activePointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    state.maxMovedPx = Math.max(state.maxMovedPx, Math.hypot(dx, dy));

    // Allow far downward, upward, and sideways stretch
    state.x = stretchAxis(dx, 260);
    state.y = dy >= 0 ? stretchAxis(dy, 440) : stretchAxis(dy, 210);
    state.rot = Math.max(-18, Math.min(18, (dx / 180) * 14));
    render();
  });

  function releaseDrag(e) {
    if (e.pointerId !== state.activePointerId) return;
    if (dockedCard.hasPointerCapture(e.pointerId)) {
      dockedCard.releasePointerCapture(e.pointerId);
    }
    state.activePointerId = null;
    dockedCard.classList.remove('is-dragging');

    // Treat short tap/click (<= 6px) as a flip gesture; longer drag snaps back cleanly
    if (state.maxMovedPx <= 6) {
      const flipped = dockedCard.classList.toggle('is-flipped');
      dockedCard.setAttribute('aria-pressed', String(flipped));
      const frontFace = dockedCard.querySelector('.id-card__face--front');
      const backFace = dockedCard.querySelector('.id-card__face--back');
      if (frontFace) frontFace.setAttribute('aria-hidden', String(flipped));
      if (backFace) backFace.setAttribute('aria-hidden', String(!flipped));
    }

    if (typeof window.gsap !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.whip = Math.max(-28, Math.min(28, -state.x * 0.22));
      state.tween = window.gsap.to(state, {
        x: 0,
        y: 0,
        rot: 0,
        whip: 0,
        duration: 0.95,
        ease: 'elastic.out(1, 0.36)',
        onUpdate: render,
        onComplete: () => {
          state.tween = null;
        }
      });
    } else {
      state.x = 0;
      state.y = 0;
      state.rot = 0;
      state.whip = 0;
      render();
    }
  }

  dockedCard.addEventListener('pointerup', releaseDrag);
  dockedCard.addEventListener('pointercancel', releaseDrag);
  dockedCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const flipped = dockedCard.classList.toggle('is-flipped');
      dockedCard.setAttribute('aria-pressed', String(flipped));
      const frontFace = dockedCard.querySelector('.id-card__face--front');
      const backFace = dockedCard.querySelector('.id-card__face--back');
      if (frontFace) frontFace.setAttribute('aria-hidden', String(flipped));
      if (backFace) backFace.setAttribute('aria-hidden', String(!flipped));
    }
  });
}

function initInteractiveExtras() {
  // 0. Render GitHub Contributions Calendar in 01 About
  renderGithubContributions();

  // 1. Far-Draggable & Flippable persistent ID Card in 03 Contact
  const dockedCard = document.getElementById('docked-id-card');
  if (dockedCard) {
    initContactCardLanyardDrag(dockedCard);
  }

  // 2. Interactive Project Stack Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') || 'all';
      filterBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });

      const projectCards = document.querySelectorAll('#projects-grid .project-card');
      projectCards.forEach((card) => {
        const rawTags = (card.getAttribute('data-tags') || '').split(',').map((t) => t.trim());
        const matches = filter === 'all' || rawTags.includes(filter);
        card.classList.toggle('is-filtered-out', !matches);
        if (matches && typeof window.gsap !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          window.gsap.fromTo(card, { opacity: 0.4, y: 12 }, { opacity: 1, y: 0, duration: 0.34, ease: 'power2.out', clearProps: 'transform,opacity' });
        }
      });
    });
  });

  // 3. Magnetic CTA buttons on fine pointers
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (finePointer && !reducedMotion && typeof window.gsap !== 'undefined') {
    document.querySelectorAll('[data-magnetic]').forEach((btn) => {
      const strength = parseFloat(btn.getAttribute('data-magnetic')) || 0.25;
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width * 0.5)) * strength;
        const dy = (e.clientY - (r.top + r.height * 0.5)) * strength;
        window.gsap.to(btn, { x: dx, y: dy, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
      });
      btn.addEventListener('pointerleave', () => {
        window.gsap.to(btn, { x: 0, y: 0, duration: 0.45, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
      });
    });
  }
}

function startLiveMotion() {
  if (liveMotionStarted) return;
  liveMotionStarted = true;

  initInteractiveExtras();

  const spineFill = document.getElementById('scroll-spine-fill');
  const heroPoster = document.querySelector('.hero__poster');
  const heroGlow = document.querySelector('.hero__glow');
  const heroName = document.getElementById('hero-name');
  const heroFigure = document.querySelector('.hero__figure');
  const heroPillars = document.querySelectorAll('.hero__pillar');
  const spaceDebris = Array.from(document.querySelectorAll('.space-debris'));
  const dockedCard = document.getElementById('docked-id-card');
  const marqueeTrack = document.getElementById('marquee-track');
  const ambientCanvas = document.getElementById('ambient-canvas');
  const liveTrailCanvas = document.getElementById('live-trail-canvas');
  const liveStarCursor = document.getElementById('live-star-cursor');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Nebula hover tracking on project cards & primary buttons
  if (finePointer && !reducedMotion) {
    document.querySelectorAll('.project-card, .btn--primary').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const nx = ((e.clientX - r.left) / r.width) * 100;
        const ny = ((e.clientY - r.top) / r.height) * 100;
        el.style.setProperty('--nebula-x', `${nx.toFixed(1)}%`);
        el.style.setProperty('--nebula-y', `${ny.toFixed(1)}%`);
      });
    });
  }

  const scrollState = {
    y: window.scrollY,
    prevY: window.scrollY,
    velocity: 0,
    maxScroll: Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
    smoothY: window.scrollY
  };
  const pointerAim = { x: 0, y: 0, smoothX: 0, smoothY: 0 };

  window.addEventListener('scroll', () => {
    scrollState.y = window.scrollY;
  }, { passive: true });

  window.addEventListener('resize', () => {
    scrollState.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }, { passive: true });

  // Live Star Comet Cursor + Stardust Trail (fine pointer LIVE mode)
  let tctx = null;
  let tdpr = 1;
  const stardust = [];
  const starPointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, lastX: 0, lastY: 0, active: false };

  if (finePointer && !reducedMotion) {
    if (liveTrailCanvas) {
      tdpr = Math.min(2, window.devicePixelRatio || 1);
      const resizeTrail = () => {
        liveTrailCanvas.width = Math.round(window.innerWidth * tdpr);
        liveTrailCanvas.height = Math.round(window.innerHeight * tdpr);
      };
      resizeTrail();
      window.addEventListener('resize', resizeTrail, { passive: true });
      tctx = liveTrailCanvas.getContext('2d');
    }

    if (liveStarCursor) {
      liveStarCursor.hidden = false;
    }

    window.addEventListener('pointermove', (e) => {
      pointerAim.x = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      pointerAim.y = e.clientY / Math.max(1, window.innerHeight) - 0.5;

      const dx = e.clientX - starPointer.lastX;
      const dy = e.clientY - starPointer.lastY;
      const speed = Math.hypot(dx, dy);
      starPointer.x = e.clientX;
      starPointer.y = e.clientY;
      starPointer.lastX = e.clientX;
      starPointer.lastY = e.clientY;

      if (!starPointer.active) {
        starPointer.active = true;
        if (liveStarCursor) liveStarCursor.classList.add('is-active');
      }

      // Spawn stardust comet particles when moving briskly
      if (tctx && speed > 4) {
        const spawnCount = Math.min(3, Math.ceil(speed / 18));
        for (let i = 0; i < spawnCount; i++) {
          stardust.push({
            x: e.clientX + (Math.random() - 0.5) * 6,
            y: e.clientY + (Math.random() - 0.5) * 6,
            vx: -dx * 0.04 + (Math.random() - 0.5) * 0.7,
            vy: -dy * 0.04 + (Math.random() - 0.5) * 0.7,
            r: 0.9 + Math.random() * 1.7,
            life: 1,
            cyan: i % 2 === 0
          });
        }
        if (stardust.length > 65) stardust.splice(0, stardust.length - 65);
      }
    }, { passive: true });
  }

  let dockedHovered = false;
  if (dockedCard) {
    dockedCard.addEventListener('pointerenter', () => { dockedHovered = true; });
    dockedCard.addEventListener('pointerleave', () => { dockedHovered = false; });
  }

  // Velocity marquee pause on hover
  let marqueePaused = false;
  if (marqueeTrack && marqueeTrack.parentElement) {
    marqueeTrack.parentElement.addEventListener('pointerenter', () => { marqueePaused = true; });
    marqueeTrack.parentElement.addEventListener('pointerleave', () => { marqueePaused = false; });
  }

  // Subtle Starfield Parallax Pool (lightweight, DPR capped at 2)
  let actx = null;
  let adpr = 1;
  const particles = [];
  if (ambientCanvas && !reducedMotion) {
    adpr = Math.min(2, window.devicePixelRatio || 1);
    const resizeAmbient = () => {
      ambientCanvas.width = Math.round(window.innerWidth * adpr);
      ambientCanvas.height = Math.round(window.innerHeight * adpr);
    };
    resizeAmbient();
    window.addEventListener('resize', resizeAmbient, { passive: true });
    actx = ambientCanvas.getContext('2d');
    const count = window.innerWidth <= 768 ? 28 : 54;
    for (let i = 0; i < count; i++) {
      const depth = 0.3 + Math.random() * 0.8;
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.55 + Math.random() * 1.15,
        depth,
        vy: (-0.06 - Math.random() * 0.14) * depth,
        vx: (Math.random() - 0.5) * 0.08 * depth,
        tone: i % 6 === 0 ? 'cyan' : (i % 6 === 3 ? 'blue' : 'white'),
        phase: Math.random() * Math.PI * 2,
        alpha: 0.16 + Math.random() * 0.34
      });
    }
  }

  let marqueeX = 0;

  // 1. Single GSAP ticker driving ambient particles, marquee velocity, parallax, and progress spine
  if (!reducedMotion && typeof window.gsap !== 'undefined') {
    window.gsap.ticker.add((t) => {
      if (document.hidden) return;
      const ratio = window.gsap.ticker.deltaRatio();
      const k = 1 - Math.pow(0.86, ratio);

      scrollState.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const instantVel = scrollState.y - scrollState.prevY;
      scrollState.prevY = scrollState.y;
      scrollState.velocity = scrollState.velocity * 0.85 + instantVel * 0.15;

      scrollState.smoothY += (scrollState.y - scrollState.smoothY) * k;
      pointerAim.smoothX += (pointerAim.x - pointerAim.smoothX) * k;
      pointerAim.smoothY += (pointerAim.y - pointerAim.smoothY) * k;

      const progress = Math.max(0, Math.min(1, scrollState.smoothY / scrollState.maxScroll));
      if (spineFill) {
        spineFill.style.transform = `scaleY(${progress.toFixed(4)})`;
      }

      // Continuous velocity-reactive marquee strip
      if (marqueeTrack && !marqueePaused) {
        const halfWidth = marqueeTrack.scrollWidth * 0.5 || 600;
        const speed = 0.65 + Math.min(4.5, Math.abs(scrollState.velocity) * 0.18);
        marqueeX -= speed * ratio;
        if (marqueeX <= -halfWidth) marqueeX += halfWidth;
        marqueeTrack.style.transform = `translate3d(${marqueeX.toFixed(1)}px, 0, 0)`;
      }

      // Subtle Starfield Parallax across the entire screen
      if (actx && ambientCanvas) {
        actx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx * ratio;
          p.y += (p.vy - scrollState.velocity * 0.03 * p.depth) * ratio;
          if (p.y < -8) p.y = h + 8;
          if (p.y > h + 8) p.y = -8;
          if (p.x < -8) p.x = w + 8;
          if (p.x > w + 8) p.x = -8;

          const drawX = p.x + pointerAim.smoothX * 28 * p.depth;
          const drawY = p.y + pointerAim.smoothY * 20 * p.depth;
          const twinkle = 0.72 + Math.sin(t * 1.8 + p.phase) * 0.28;
          const a = (p.alpha * 0.65 * twinkle).toFixed(2);

          actx.beginPath();
          actx.arc(drawX * adpr, drawY * adpr, p.r * adpr, 0, Math.PI * 2);
          if (p.tone === 'cyan') {
            actx.fillStyle = `rgba(59, 130, 246, ${a})`;
          } else if (p.tone === 'blue') {
            actx.fillStyle = `rgba(30, 58, 138, ${a})`;
          } else {
            actx.fillStyle = `rgba(148, 163, 184, ${a})`;
          }
          actx.fill();
        }
      }

      // Live Star Comet Cursor + fading stardust trail (darker midnight-blue tones)
      if (liveStarCursor && starPointer.active) {
        liveStarCursor.style.transform = `translate3d(${starPointer.x.toFixed(1)}px, ${starPointer.y.toFixed(1)}px, 0)`;
      }
      if (tctx && liveTrailCanvas) {
        tctx.clearRect(0, 0, liveTrailCanvas.width, liveTrailCanvas.height);
        for (let i = stardust.length - 1; i >= 0; i--) {
          const s = stardust[i];
          s.x += s.vx * ratio;
          s.y += s.vy * ratio;
          s.life -= 0.036 * ratio;
          if (s.life <= 0) {
            stardust.splice(i, 1);
            continue;
          }
          tctx.beginPath();
          tctx.arc(s.x * tdpr, s.y * tdpr, (s.r * s.life) * tdpr, 0, Math.PI * 2);
          tctx.fillStyle = s.cyan
            ? `rgba(30, 58, 138, ${(s.life * 0.42).toFixed(2)})`
            : `rgba(15, 23, 42, ${(s.life * 0.52).toFixed(2)})`;
          tctx.fill();
        }
      }

      // Hero "Orbit" Warp Transition + Space Debris scroll parallax & float
      const warpProgress = Math.max(0, Math.min(1, scrollState.smoothY / 620));
      const heroFactor = Math.min(1.5, scrollState.smoothY / 520);
      const breathY = Math.sin(t * 1.35) * 10;
      const breathPillar = 0.22 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.26;

      if (heroPoster) {
        const warpScale = 1 - warpProgress * 0.22;
        const warpOpacity = Math.max(0.12, 1 - warpProgress * 0.88);
        heroPoster.style.transform = `scale(${warpScale.toFixed(4)}) translate3d(0, ${(warpProgress * 36).toFixed(1)}px, 0)`;
        heroPoster.style.opacity = warpOpacity.toFixed(3);
      }

      if (heroGlow) {
        heroGlow.style.transform = `scale(${(1 - warpProgress * 0.35).toFixed(3)})`;
      }

      spaceDebris.forEach((item, idx) => {
        const speed = parseFloat(item.getAttribute('data-debris-speed')) || 0.15;
        const floatY = Math.sin(t * 0.95 + idx * 1.7) * 11;
        const floatRot = Math.sin(t * 0.65 + idx * 1.3) * 5;
        const scrollShift = scrollState.smoothY * speed;
        const px = pointerAim.smoothX * 18 * (idx % 2 === 0 ? 1 : -1);
        item.style.transform = `translate3d(${px.toFixed(1)}px, ${(floatY + scrollShift).toFixed(1)}px, 0) rotate(${floatRot.toFixed(2)}deg)`;
      });

      if (heroName) {
        const nameY = heroFactor * -65;
        heroName.style.transform = `translate3d(0, ${nameY.toFixed(2)}px, 0)`;
      }

      if (heroFigure) {
        const px = pointerAim.smoothX * 26;
        const py = pointerAim.smoothY * 16 + breathY + heroFactor * 28;
        heroFigure.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`;
      }

      heroPillars.forEach((pillar, idx) => {
        const dir = idx === 0 ? -1 : 1;
        const py = heroFactor * -55 + Math.sin(t * 1.1 + idx) * 10;
        pillar.style.transform = `translate3d(${(pointerAim.smoothX * 14 * dir).toFixed(2)}px, ${py.toFixed(2)}px, 0)`;
        pillar.style.opacity = breathPillar.toFixed(3);
      });

      if (dockedCard && !dockedHovered && !dockedCard.classList.contains('is-dragging')) {
        const floatY = Math.sin(t * 1.65) * 6;
        const floatRot = Math.sin(t * 1.05) * 1.4;
        dockedCard.style.setProperty('--idle-y', `${floatY.toFixed(2)}px`);
        dockedCard.style.setProperty('--idle-rot', `${floatRot.toFixed(2)}deg`);
      }
    });
  } else if (spineFill) {
    window.addEventListener('scroll', () => {
      const p = Math.max(0, Math.min(1, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)));
      spineFill.style.transform = `scaleY(${p.toFixed(4)})`;
    }, { passive: true });
  }

  // 2. Scroll-triggered section & card reveals
  if (!reducedMotion && typeof window.gsap !== 'undefined' && typeof IntersectionObserver !== 'undefined') {
    const revealTargets = Array.from(
      document.querySelectorAll('.docked-badge-wrap, .about__lead, .pillar-item, .project-card, .contact-email-box')
    );

    const vh = window.innerHeight;
    revealTargets.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top > vh * 0.92) {
        window.gsap.set(el, { opacity: 0, y: 40, scale: 0.97 });
      }
    });

    const io = new IntersectionObserver((entries, obs) => {
      let batchIndex = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        obs.unobserve(entry.target);
        const delay = Math.min(0.26, batchIndex * 0.08);
        batchIndex++;
        window.gsap.to(entry.target, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.65,
          delay,
          ease: 'power3.out',
          clearProps: 'transform,opacity'
        });
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -30px 0px' });

    revealTargets.forEach((el) => io.observe(el));
  }
}

/* ============================================================================
   8. REAL CUMULATIVE LAYOUT SHIFT (CLS) OBSERVER (Section 14 Verification)
   ============================================================================ */
function initLayoutShiftObserver() {
  window.__FARSKY_CLS__ = 0;
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__FARSKY_CLS__ += entry.value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch (_err) {
    // Ignore if browser does not support layout-shift entry type
  }
}

/* ============================================================================
   9. BOOTSTRAP PORTFOLIO
   ============================================================================ */
function initPortfolio() {
  initLayoutShiftObserver();
  renderContent();
  printDevToolsEasterEgg();
  initAvatarFallback();
  initProjectCardTilt();
  initIntroCardAndLanyard();
  if (currentState === STATES.LIVE) {
    startLiveMotion();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortfolio);
} else {
  initPortfolio();
}
