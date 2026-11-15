// site/app.js — Scroll-Driven Cinematic Portfolio Engine (Mobile-Optimized & HD)

(function () {
  'use strict';

  // Safe fallback if config.js failed to load
  const cfg = window.CONFIG || {
    name: "Pranav Mali",
    firstName: "PRANAV",
    lastName: "MALI",
    role: "Data Analyst / AI Enthusiast",
    location: "Pune, India",
    status: "Pune · Open to Work",
    timeline: [
      { t: [0.0, 7.0], h: 0.8, id: "intro-motion" },
      { t: [7.0, 7.0], h: 0.8, id: "intro", section: "intro" },
      { t: [7.0, 14.5], h: 0.9, id: "about-motion" },
      { t: [14.5, 14.5], h: 0.8, id: "about", section: "about" },
      { t: [14.5, 32.0], h: 1.5, id: "work", section: "work" },
      { t: [32.0, 38.5], h: 1.1, id: "skills", section: "skills" },
      { t: [38.5, 40.2], h: 0.6, id: "resume-motion" },
      { t: [40.2, 41.5], h: 1.0, id: "resume-slide" },
      { t: [41.5, 42.2], h: 1.0, id: "resume", section: "resume" },
      { t: [42.2, 43.0], h: 0.5, id: "contact-motion" },
      { t: [43.0, 46.33], h: 0.9, id: "contact", section: "contact" }
    ]
  };

  // DOM Elements
  const loader = document.getElementById('loader');
  const video = document.getElementById('film');
  const filmPoster = document.getElementById('film-poster');
  const stage = document.getElementById('stage');
  const characterCanvas = document.getElementById('character-canvas');
  const scrollTrack = document.getElementById('scroll-track');
  const scrollHint = document.getElementById('scroll-hint');
  const contactSvgFrame = document.getElementById('contact-svg-frame');
  const resumePaper = document.getElementById('resume-paper');
  const navItems = document.querySelectorAll('.nav-item');

  // Cached Dynamic Elements for 60fps performance
  let cachedProjectCards = [];
  let cachedSkillChips = [];
  let cachedSkillRows = [];
  let lastStageX = null;
  let currentActiveNav = '';
  let lastWindowWidth = window.innerWidth;

  // Video Selection based on viewport width
  const isMobile = () => window.innerWidth <= 760;
  const getVideoUrl = () => isMobile() ? 'media/film_mobile.mp4' : 'media/film.mp4';

  // Playhead Tracking & Seek Tuning
  let targetPlayhead = 0;
  let currentPlayhead = 0;
  const LERP_FACTOR = isMobile() ? 0.16 : 0.09; // Weighted, smooth cinematic damping
  const getSeekThreshold = () => isMobile() ? 0.04 : 0.02;
  const hasFastSeek = typeof video.fastSeek === 'function';

  // Timeline Segments processed from CONFIG
  let segmentRanges = [];
  let totalScrollHeight = 0;

  // ----------------------------------------------------
  // 1. Populate Dynamic Content from CONFIG
  // ----------------------------------------------------
  function populateContent() {
    // Populate Status Text
    const statusText = document.querySelector('.status-text');
    if (statusText && cfg.status) {
      statusText.textContent = cfg.status;
    }

    // Populate Work Project Cards
    const projectCardsContainer = document.getElementById('project-cards');
    if (projectCardsContainer && cfg.projects) {
      projectCardsContainer.innerHTML = cfg.projects.map((p, idx) => `
        <article class="project-card">
          <div class="card-top">
            <span class="card-cat">${p.category}</span>
            <h3 class="card-title">${p.title}</h3>
            <p class="card-desc">${p.description}</p>
          </div>
          <div class="card-bottom">
            <div class="card-techs">
              ${p.tech.map(t => `<span class="tech-tag">${t}</span>`).join('')}
            </div>
            <div class="card-footer">
              <span class="card-metric">${p.metric}</span>
              <a href="${p.live || p.link}" target="_blank" rel="noopener noreferrer" class="card-link">
                View Project →
              </a>
            </div>
          </div>
        </article>
      `).join('');
    }

    // Populate Skills Cloud in 2-Column Rows (max-width: 620px, gap: 14px 16px)
    const skillsCloud = document.getElementById('skills-cloud');
    if (skillsCloud && cfg.skills) {
      // Group skills into 5 rows (Row 1-4: 2 skills each, Row 5: 1 skill)
      const rows = [];
      for (let i = 0; i < cfg.skills.length; i += 2) {
        rows.push(cfg.skills.slice(i, i + 2));
      }
      skillsCloud.innerHTML = rows.map((rowSkills, rIdx) => {
        const rowNum = rIdx + 1;
        const chipsHtml = rowSkills.map(s => `
          <div class="skill-chip" data-row="${rowNum}">
            <span class="skill-name">${s.name}</span>
            <span class="skill-badge">${s.level}</span>
          </div>
        `).join('');
        return `<div class="skill-row" data-row="${rowNum}">${chipsHtml}</div>`;
      }).join('');
    }

    // Cache populated DOM elements once to eliminate repeated querySelectorAll in RAF
    cachedProjectCards = Array.from(document.querySelectorAll('.project-card'));
    cachedSkillChips = Array.from(document.querySelectorAll('.skill-chip'));
    cachedSkillRows = Array.from(document.querySelectorAll('.skill-row'));

    // Populate Social Links
    const socialLinks = document.getElementById('social-links');
    if (socialLinks && cfg.contact && cfg.contact.socials) {
      socialLinks.innerHTML = cfg.contact.socials.map(s => `
        <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="social-btn">
          <span class="social-name">${s.name}</span>
          <span class="social-handle">${s.handle}</span>
        </a>
      `).join('');
    }

    // Copy Email Functionality
    const copyBtn = document.getElementById('copy-email-btn');
    const copyText = document.getElementById('copy-text');
    if (copyBtn && cfg.contact && cfg.contact.email) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cfg.contact.email).then(() => {
          copyText.textContent = 'Copied!';
          setTimeout(() => { copyText.textContent = 'Copy'; }, 2000);
        }).catch(() => {
          copyText.textContent = 'malipranav1501@gmail.com';
        });
      });
    }
  }

  // ----------------------------------------------------
  // 2. Build Scroll Segments & Track (Increased Scroll Sensitivity by 15%)
  // ----------------------------------------------------
  const SCROLL_DISTANCE_FACTOR = 3.48; // 15% more sensitive scrubbing (4.0 / 1.15 = 3.48)

  function buildTimeline() {
    // Use documentElement.clientHeight to avoid mobile URL bar jump issues
    const vh = document.documentElement.clientHeight || window.innerHeight;
    let currentY = 0;
    segmentRanges = [];

    cfg.timeline.forEach((seg) => {
      const segPixelHeight = seg.h * vh * SCROLL_DISTANCE_FACTOR;
      segmentRanges.push({
        id: seg.id,
        section: seg.section || null,
        fromT: seg.t[0],
        toT: seg.t[1],
        isHold: seg.t[0] === seg.t[1],
        startY: currentY,
        endY: currentY + segPixelHeight,
        height: segPixelHeight
      });
      currentY += segPixelHeight;
    });

    totalScrollHeight = currentY;
    scrollTrack.style.height = `${totalScrollHeight + vh}px`;
  }

  // ----------------------------------------------------
  // 3. Progressive Video Streaming & Fast Unblocking
  // ----------------------------------------------------
  function loadFilm() {
    const url = getVideoUrl();

    // iOS Autoplay / Seek Unlock (passive listeners)
    const unlockIOS = () => {
      video.play().then(() => {
        video.pause();
        if (hasFastSeek) {
          video.fastSeek(0.01);
        } else {
          video.currentTime = 0.01;
        }
      }).catch(() => {});
      window.removeEventListener('touchstart', unlockIOS);
      window.removeEventListener('touchend', unlockIOS);
      window.removeEventListener('click', unlockIOS);
    };
    window.addEventListener('touchstart', unlockIOS, { once: true, passive: true });
    window.addEventListener('touchend', unlockIOS, { once: true, passive: true });
    window.addEventListener('click', unlockIOS, { once: true });

    let isDismissed = false;
    const dismissLoader = () => {
      if (isDismissed) return;
      isDismissed = true;
      setTimeout(() => {
        if (loader) loader.classList.add('loaded');
        if (filmPoster) filmPoster.classList.add('fade-out');
      }, 100);
    };

    // Direct HTTP Range streaming
    video.src = url;
    video.load();

    // Dismiss as soon as the first frame is ready
    if (video.readyState >= 2) {
      dismissLoader();
    } else {
      video.addEventListener('loadeddata', () => { dismissLoader(); }, { once: true });
      video.addEventListener('canplay', () => { dismissLoader(); }, { once: true });
      video.addEventListener('error', () => {
        console.warn('Video load error or file:// mode, proceeding with fallback');
        dismissLoader();
      }, { once: true });
    }

    // Fail-safe timeout: never block longer than 0.3s
    setTimeout(() => {
      dismissLoader();
    }, 300);
  }

  // ----------------------------------------------------
  // 4. Map Scroll to Film Time
  // ----------------------------------------------------
  function updateScrollTarget() {
    const scrollY = window.scrollY;
    const maxScroll = totalScrollHeight;

    // Hide Scroll Hint after scrolling starts (scaled with 50% sensitivity reduction)
    if (scrollY > 50 * SCROLL_DISTANCE_FACTOR) {
      if (scrollHint) scrollHint.classList.add('hidden');
    } else {
      if (scrollHint) scrollHint.classList.remove('hidden');
    }

    // Find active segment
    for (let i = 0; i < segmentRanges.length; i++) {
      const seg = segmentRanges[i];
      if (scrollY >= seg.startY && (scrollY <= seg.endY || i === segmentRanges.length - 1)) {
        const segProgress = seg.height > 0 ? (scrollY - seg.startY) / seg.height : 0;
        const clampedProg = Math.max(0, Math.min(1, segProgress));
        targetPlayhead = seg.fromT + clampedProg * (seg.toT - seg.fromT);
        break;
      }
    }
  }

  // ----------------------------------------------------
  // 5. Horizontal Stage Shift Keyframes (Desktop Only)
  // ----------------------------------------------------
  function computeStageShift(time) {
    if (isMobile()) {
      return 0; // Always centered on mobile
    }

    if (time <= 14.5) {
      // Intro (0s - 7s) & About (7s - 14.5s):
      // Character is comfortably on the right side (+22vw),
      // leaving left side completely open for Intro text and About glass-panel!
      return 22;
    } else if (time <= 16.0) {
      // Smoothly transition from About (+22vw) to Work (0vw)
      const p = (time - 14.5) / (16.0 - 14.5);
      return 22 - p * 22; // 22 -> 0
    } else if (time <= 32.0) {
      // Work (16s - 32s):
      // Character is DEAD CENTER (0vw) sitting at the desk typing on laptop!
      // 3 project cards are placed horizontally at the table level beneath him.
      return 0;
    } else if (time <= 34.5) {
      // Character stands up from the desk and starts moving to the left:
      const p = (time - 32.0) / (34.5 - 32.0);
      return 0 - p * 14; // 0 -> -14vw
    } else if (time <= 39.5) {
      // Skills (34.5s - 39.5s):
      // Character stands on the LEFT side (-14vw),
      // Skills chips appear on the right from right to left!
      return -14;
    } else if (time <= 40.2) {
      // Gentle shift into resume position
      const p = (time - 39.5) / (40.2 - 39.5);
      return -14 + p * 4; // -14 -> -10vw
    } else {
      // Lock character in exact position (-10vw) during Resume & Contact
      // Zero camera jerk, zero framing shift as Contact UI transitions in!
      return -10;
    }
  }

  // ----------------------------------------------------
  // 6. Active Section & Down-to-Up Fade In / Fade Out Loop
  // ----------------------------------------------------
  const sections = {
    intro: document.getElementById('sec-intro'),
    about: document.getElementById('sec-about'),
    work: document.getElementById('sec-work'),
    skills: document.getElementById('sec-skills'),
    resume: document.getElementById('sec-resume'),
    contact: document.getElementById('sec-contact')
  };

  // Easing function for smooth, synchronized down-to-up transitions
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Calculates Down-to-Up transition state with S-curve easing:
  // - Enters by moving up from +travelPx to 0px while fading in (0 -> 1)
  // - Holds steady at 0px with opacity 1 during character motion
  // - Exits by continuing to move up from 0px to -travelPx while fading out (1 -> 0)
  function calcDownToUp(time, enterStart, enterPeak, exitPeak, exitEnd, travelPx = 30) {
    if (time < enterStart) {
      return { op: 0, y: travelPx };
    }
    if (time >= enterStart && time < enterPeak) {
      const rawP = (time - enterStart) / (enterPeak - enterStart);
      const p = easeInOutQuad(Math.max(0, Math.min(1, rawP)));
      return { op: p, y: (1 - p) * travelPx };
    }
    if (time >= enterPeak && time <= exitPeak) {
      return { op: 1, y: 0 };
    }
    if (time > exitPeak && time <= exitEnd) {
      const rawP = (time - exitPeak) / (exitEnd - exitPeak);
      const p = easeInOutQuad(Math.max(0, Math.min(1, rawP)));
      return { op: 1 - p, y: -p * travelPx };
    }
    return { op: 0, y: -travelPx };
  }

  function applySectionState(sec, state) {
    if (!sec) return;
    sec.style.opacity = state.op.toFixed(3);
    sec.style.visibility = state.op > 0.005 ? 'visible' : 'hidden';
    sec.style.transform = `translateY(${state.y.toFixed(1)}px)`;
  }

  function updateVisuals(time) {
    // Character Horizontal Position:
    // During Home and About sections (time < 14.8s), shift character 75px to the left
    // so character's right shoulder sits close to the right edge of the About card.
    // In Work section and beyond (time >= 14.8s), smoothly returns to translateX(0).
    const isPreWork = time < 14.8;
    if (characterCanvas) {
      if (!isMobile()) {
        characterCanvas.classList.toggle('work-mode', !isPreWork);
        characterCanvas.style.transform = isPreWork ? 'translateX(-75px)' : 'translateX(0)';
      } else {
        characterCanvas.classList.remove('work-mode');
        characterCanvas.style.transform = 'none';
      }
    }

    // Dynamic stage sideways shift — only set CSS variable when value changes
    const stageX = computeStageShift(time);
    if (stageX !== lastStageX) {
      document.documentElement.style.setProperty('--stage-x', `${stageX}vw`);
      lastStageX = stageX;
    }

    // Effect length matches exact character movements in background (synchronized simultaneously):
    // 1. Intro: 0.0s - 7.0s (Instant Hero Load: 100% visible immediately without entry animation; fades out briskly 7.0s - 8.8s into About)
    let stIntro;
    if (time <= 7.0) {
      stIntro = { op: 1, y: 0 };
    } else if (time <= 8.8) {
      const rawP = (time - 7.0) / (8.8 - 7.0);
      const p = easeInOutQuad(Math.max(0, Math.min(1, rawP)));
      stIntro = { op: 1 - p, y: -p * 30 };
    } else {
      stIntro = { op: 0, y: -30 };
    }
    // 2. About: 7.2s - 14.5s (steps forward toward camera in close-up; settles fast at 9.6s with zero dead scrolling)
    const stAbout = calcDownToUp(time, 7.2, 9.6, 14.5, 16.2);
    // 3. Work: 14.8s - 32.0s (sits at desk in center, typing on laptop; finishes entrance at 16.8s)
    const stWork = calcDownToUp(time, 14.8, 16.8, 31.0, 33.5);
    // 4. Skills: 32.2s - 39.0s (stands up, moves left; finishes entrance at 34.5s)
    const stSkills = calcDownToUp(time, 32.2, 34.5, 39.0, 40.2);
    // 5. Resume: 40.0s - 42.2s (reaches up, pulls down roller; finishes entrance at 41.2s)
    const stResume = calcDownToUp(time, 40.0, 41.2, 42.2, 42.8);
    // 6. Contact: 42.4s - 46.5s (waves goodbye; finishes entrance at 43.5s)
    const stContact = calcDownToUp(time, 42.4, 43.5, 46.5, 46.5);

    // Apply continuous down-to-up styles
    applySectionState(sections.intro, stIntro);
    applySectionState(sections.about, stAbout);
    applySectionState(sections.work, stWork);
    applySectionState(sections.skills, stSkills);
    applySectionState(sections.resume, stResume);
    applySectionState(sections.contact, stContact);

    // Toggle active state for CSS styling
    sections.intro.classList.toggle('active', stIntro.op > 0.25);
    sections.about.classList.toggle('active', stAbout.op > 0.25);
    sections.work.classList.toggle('active', stWork.op > 0.25);
    sections.skills.classList.toggle('active', stSkills.op > 0.25);
    sections.resume.classList.toggle('active', stResume.op > 0.25);
    sections.contact.classList.toggle('active', stContact.op > 0.25);

    // Staggered Card Animation in Work (using cached nodes)
    const workInView = stWork.op > 0.15;
    for (let i = 0; i < cachedProjectCards.length; i++) {
      cachedProjectCards[i].classList.toggle('in-view', workInView);
    }

    // Repeatable Row-by-Row Right-to-Left Fade-In Animation (Every Scroll Up/Down, threshold: 0.25)
    const skillsInView = stSkills.op > 0.25;
    sections.skills.classList.toggle('active', skillsInView);
    for (let i = 0; i < cachedSkillRows.length; i++) {
      cachedSkillRows[i].classList.toggle('in-view', skillsInView);
    }
    for (let i = 0; i < cachedSkillChips.length; i++) {
      cachedSkillChips[i].classList.toggle('in-view', skillsInView);
    }

    // Resume Drop Animation (synced to hands pulling down: starts at 40.2s, settles by 41.5s)
    const isResumeDropped = time >= 40.2 && time < 42.4;
    resumePaper.classList.toggle('dropped', isResumeDropped);

    // Contact SVG Bounding Frame
    contactSvgFrame.classList.toggle('active', stContact.op > 0.15);
    contactSvgFrame.classList.toggle('drawn', time >= 43.2);

    // Active Navigation State (only update DOM when activeNav changes)
    let activeNav = 'intro';
    if (time >= 42.3) activeNav = 'contact';
    else if (time >= 40.0) activeNav = 'resume';
    else if (time >= 32.2) activeNav = 'skills';
    else if (time >= 14.8) activeNav = 'work';
    else if (time >= 7.2) activeNav = 'about';
    else activeNav = 'intro';

    if (activeNav !== currentActiveNav) {
      currentActiveNav = activeNav;
      navItems.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === activeNav);
      });
    }
  }

  // ----------------------------------------------------
  // 7. RequestAnimationFrame Render Loop with Seek Watchdog
  // ----------------------------------------------------
  let isSeeking = false;
  let lastSeekTime = 0;

  video.addEventListener('seeking', () => { isSeeking = true; });
  video.addEventListener('seeked', () => { isSeeking = false; });

  function renderLoop() {
    try {
      // Smooth playhead with lerp
      currentPlayhead += (targetPlayhead - currentPlayhead) * LERP_FACTOR;

      const now = performance.now();
      // Watchdog timeout suited for mobile and desktop
      const seekTimeout = isMobile() ? 120 : 75;
      if (isSeeking && now - lastSeekTime > seekTimeout) {
        isSeeking = false;
      }

      // Seek using fastSeek on mobile WebKit/Blink for smooth hardware decoding
      if (video.readyState >= 1 && !isSeeking && Math.abs(currentPlayhead - video.currentTime) > getSeekThreshold()) {
        try {
          isSeeking = true;
          lastSeekTime = now;
          if (hasFastSeek) {
            video.fastSeek(currentPlayhead);
          } else {
            video.currentTime = currentPlayhead;
          }
        } catch (e) {
          isSeeking = false;
        }
      }

      // Update visual states and keyframed transforms
      updateVisuals(currentPlayhead);
    } catch (err) {
      console.warn('Render loop error:', err);
    }

    requestAnimationFrame(renderLoop);
  }

  // ----------------------------------------------------
  // 8. Navigation Smooth-Scroll to Section Holds
  // ----------------------------------------------------
  function setupNavHandlers() {
    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        // Find corresponding hold segment
        const holdSeg = segmentRanges.find(s => s.section === targetId);
        if (holdSeg) {
          const targetY = holdSeg.startY + holdSeg.height * 0.5;
          window.scrollTo({
            top: targetY,
            behavior: 'smooth'
          });
        }
      });
    });

    const logoBtn = document.getElementById('logo-btn');
    if (logoBtn) {
      logoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  // ----------------------------------------------------
  // 9. Resize & Initialization
  // ----------------------------------------------------
  function onResize() {
    // Only rebuild timeline if the horizontal width actually changed (rotation / resize),
    // ignoring vertical height changes caused by mobile address bar show/hide.
    const currentWidth = window.innerWidth;
    if (Math.abs(currentWidth - lastWindowWidth) > 30) {
      lastWindowWidth = currentWidth;
      buildTimeline();
      updateScrollTarget();
    }
  }

  function setupSkillsObserver() {
    if ('IntersectionObserver' in window) {
      const secSkills = document.getElementById('sec-skills');
      if (secSkills) {
        const skillsObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) {
              secSkills.classList.remove('active');
              for (let i = 0; i < cachedSkillRows.length; i++) {
                cachedSkillRows[i].classList.remove('in-view', 'active');
              }
              for (let i = 0; i < cachedSkillChips.length; i++) {
                cachedSkillChips[i].classList.remove('in-view', 'active');
              }
            }
          });
        }, { threshold: 0.25 });
        skillsObserver.observe(secSkills);
      }
    }
  }

  function init() {
    try {
      populateContent();
      buildTimeline();
      loadFilm();
      setupNavHandlers();
      setupSkillsObserver();

      // Ensure Hero section is 100% visible immediately upon load
      applySectionState(sections.intro, { op: 1, y: 0 });
      sections.intro.classList.add('active');

      window.addEventListener('scroll', updateScrollTarget, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });

      updateScrollTarget();
      requestAnimationFrame(renderLoop);
    } catch (err) {
      console.warn('Initialization error:', err);
    } finally {
      // Guaranteed fail-safe: dismiss loader after quick intro
      setTimeout(() => {
        if (loader) loader.classList.add('loaded');
        if (filmPoster) filmPoster.classList.add('fade-out');
      }, 150);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
