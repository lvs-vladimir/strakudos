// Strakudos DOM Adapter
// Thin JavaScript layer for Kotlin controllers/strategies.
(function () {
  if (window.StrakudosDom && window.StrakudosDom.version >= 6) return;

  const ACTIVITY_RE = /\/activities\/(\d+)/;
  const ATHLETE_RE = /\/athletes\/(\d+)/;

  function safeText(el) {
    try { return (el && el.textContent ? el.textContent : '').trim(); } catch (e) { return ''; }
  }

  function extractActivityId(href) {
    const match = String(href || '').match(ACTIVITY_RE);
    return match ? match[1] : null;
  }

  function extractAthleteId(href) {
    const match = String(href || '').match(ATHLETE_RE);
    return match ? match[1] : null;
  }

  function getProfileAthleteId() {
    try {
      if (window.__stravaAthleteId) return window.__stravaAthleteId;
      const cookieId = (document.cookie.match(/strava_remember_id=([^;]+)/) || [])[1];
      if (cookieId) return cookieId;
      const token = (document.cookie.match(/strava_remember_token=([^;]+)/) || [])[1];
      if (token && token.indexOf('_') !== -1) return token.split('_')[1];
      const meta = document.querySelector('meta[name="athlete-id"]');
      if (meta) return meta.getAttribute('content');
      var navLink = document.querySelector('header a[href*="/athletes/"], nav a[href*="/athletes/"], [data-testid="user-menu"] a[href*="/athletes/"], a[href*="/athletes/"][class*="avatar"], a[href*="/athletes/"][class*="profile"], a[href*="/athletes/"][class*="user-menu"]');
      if (navLink) {
        var navId = extractAthleteId(navLink.getAttribute('href') || navLink.href || '');
        if (navId) return navId;
      }
    } catch (e) {}
    return null;
  }

  function getProfileName() {
    try {
      const selectors = [
        '[data-testid="athlete-name"]',
        '[data-testid="user-menu"]',
        'header a[href*="/athletes/"]',
        'nav a[href*="/athletes/"]'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        const text = safeText(el);
        if (text && text.length < 80) return text;
      }
    } catch (e) {}
    return '';
  }

  function getActivityLinks(root) {
    const seen = new Set();
    const links = [];
    try {
      root.querySelectorAll('a[href*="/activities/"]').forEach(function (link) {
        const id = extractActivityId(link.getAttribute('href') || link.href || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        links.push({ id: id, el: link });
      });
    } catch (e) {}
    return links;
  }

  function getOwnerLinks(root) {
    const seen = new Set();
    const links = [];
    try {
      root.querySelectorAll('[data-testid="owners-name"] a[href*="/athletes/"], a[href*="/athletes/"]').forEach(function (link) {
        const id = extractAthleteId(link.getAttribute('href') || link.href || '');
        const key = id || safeText(link);
        if (!key || seen.has(key)) return;
        seen.add(key);
        links.push({ id: id, name: safeText(link).substring(0, 80), el: link });
      });
    } catch (e) {}
    return links;
  }

  function getNearestByY(items, targetEl) {
    if (!items || items.length === 0) return null;
    const targetRect = targetEl.getBoundingClientRect();
    const targetY = targetRect.top + targetRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const item of items) {
      const rect = item.el.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const x = rect.left + rect.width / 2;
      const hiddenPenalty = (rect.width === 0 || rect.height === 0) ? 10000 : 0;
      const score = Math.abs(y - targetY) * 8 + Math.abs(x - targetX) + hiddenPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  function getTimeText(root) {
    const timeEl = root.querySelector('time') ||
      root.querySelector('[data-testid*="time" i]') ||
      root.querySelector('.timestamp') ||
      root.querySelector('[class*="time" i]') ||
      root.querySelector('span[class*="date" i]');
    return safeText(timeEl).toLowerCase();
  }

  function isRecentActivity(root) {
    try {
      const timeText = getTimeText(root);
      if (!timeText) return true;
      if (timeText.includes('just now') || timeText === 'now' || timeText.includes('today') || timeText.includes('yesterday')) return true;
      const ago = timeText.match(/(\d+)\s*(hour|hours|hr|hrs|h|day|days|d)/);
      if (ago) {
        const value = parseInt(ago[1], 10);
        const unit = ago[2];
        if (unit.startsWith('h') || unit.startsWith('hr')) return value <= 72;
        if (unit.startsWith('d') || unit === 'day' || unit === 'days') return value <= 3;
      }
      const short = timeText.match(/^(\d+)([hd])$/);
      if (short) return short[2] === 'h' ? parseInt(short[1], 10) <= 72 : parseInt(short[1], 10) <= 3;
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthMatch = timeText.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d+)/i);
      if (monthMatch) {
        const now = new Date();
        const d = new Date(now.getFullYear(), monthNames.indexOf(monthMatch[1].slice(0, 3).toLowerCase()), parseInt(monthMatch[2], 10));
        if (d > now) d.setFullYear(now.getFullYear() - 1);
        return ((now - d) / 36e5) <= 72;
      }
    } catch (e) {}
    return true;
  }

  function isKudosButton(btn) {
    if (!btn) return false;
    const testId = btn.getAttribute('data-testid') || '';
    if (testId === 'give_kudos_button') return false;
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
    const text = safeText(btn).toLowerCase();
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.width > 220 || rect.height > 110) return false;
    const isKudos = testId === 'kudos_button' ||
      testId === 'un-kudos_button' ||
      (aria.includes('kudos') && !/\d/.test(aria) && !aria.includes('view') && rect.width < 90) ||
      ((aria.includes('like') || aria.includes('нрав')) && !/\d/.test(aria));
    if (!isKudos) return false;
    if (/\d/.test(aria)) return false;
    if (text.includes('people') || text.includes('liked this')) return false;
    return true;
  }

  function getKudosButtons(root) {
    try {
      return Array.from(root.querySelectorAll('button, [role="button"]')).filter(isKudosButton);
    } catch (e) {
      return [];
    }
  }

  function isLikedButton(btn) {
    if (!btn) return false;
    const testId = btn.getAttribute('data-testid') || '';
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    const svgFill = btn.querySelector('svg')?.getAttribute('fill');
    return testId.includes('un-kudos') || pressed || aria.includes('remove kudos') || svgFill === '#fc5200';
  }

function isInViewportByRect(rect) {
  return rect.bottom >= 80 && rect.top <= (window.innerHeight - 40);
}

function isNearViewportByRect(rect, margin) {
  const safeMargin = typeof margin === 'number' ? margin : 800;
  return rect.bottom >= -safeMargin && rect.top <= (window.innerHeight + safeMargin);
}

function isInViewport(el) {
  return isInViewportByRect(el.getBoundingClientRect());
}

function clickElement(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y };
    try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'mouse' }, opts))); } catch (e) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'mouse' }, opts))); } catch (e) {}
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function getCards() {
    const selectors = ['[data-testid="web-feed-entry"]', '[data-testid="feed-entry"]', 'div[id^="feed-entry-"]', 'article'];
    const cards = [];
    const seen = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(function (card) {
        if (seen.has(card)) return;
        if (!getActivityLinks(card).length && !getKudosButtons(card).length) return;
        if (cards.some(function (existing) { return existing.contains(card); })) return;
        seen.add(card);
        cards.push(card);
      });
    }
    return cards;
  }

  function isOwnActivity(ownerId, athleteName, card) {
    const profileId = getProfileAthleteId();
    if (profileId && ownerId && profileId === ownerId) return true;
    const profileName = getProfileName().toLowerCase();
    if (profileName && athleteName && profileName === athleteName.toLowerCase()) return true;
    if (profileId && card) {
      try {
        if (card.querySelector('a[href*="/athletes/' + profileId + '"]')) return true;
      } catch (e) {}
    }
    return false;
  }

  function getActivityTitle(root) {
    try {
      var titleEl = root.querySelector('[data-testid="activity-name"]') ||
        root.querySelector('h2') ||
        root.querySelector('h3') ||
        root.querySelector('strong[class*="name" i]') ||
        root.querySelector('[class*="activity-name" i]') ||
        root.querySelector('[class*="activity-title" i]');
      var text = safeText(titleEl);
      if (text && text.length < 200) return text;
      var fallback = root.querySelector('a[href*="/activities/"]');
      if (fallback) {
        text = safeText(fallback);
        if (text && text.length < 200) return text;
      }
    } catch (e) {}
    return '';
  }

  function getTargetScope(card, btn) {
    let best = null;
    let el = btn.parentElement;
    while (el && el !== card && el !== document.body) {
      const links = getActivityLinks(el);
      const buttons = getKudosButtons(el);
      if (links.length === 1 && buttons.length <= 1) return el;
      if (!best && (links.length > 0 || buttons.length <= 1)) best = el;
      el = el.parentElement;
    }
    return best || card;
  }

  function resolveActivityId(card, btn, index, usedIds) {
    const scope = getTargetScope(card, btn);
    const scopedLinks = getActivityLinks(scope);
    const allLinks = getActivityLinks(card);
    let chosen = null;

    if (scopedLinks.length === 1) chosen = scopedLinks[0];
    if (!chosen) {
      const unusedScoped = scopedLinks.filter(function (item) { return !usedIds.has(item.id); });
      chosen = getNearestByY(unusedScoped.length ? unusedScoped : scopedLinks, btn);
    }
    if (!chosen) {
      const unusedAll = allLinks.filter(function (item) { return !usedIds.has(item.id); });
      chosen = getNearestByY(unusedAll.length ? unusedAll : allLinks, btn);
    }
    if (!chosen && allLinks[index]) chosen = allLinks[index];
    if (!chosen && allLinks[0]) chosen = allLinks[0];

    const baseId = chosen ? chosen.id : ((card.getAttribute('data-testid') || card.id || 'card') + ':button:' + index);
    let activityId = baseId;
    if (usedIds.has(activityId)) activityId = baseId + ':kudos:' + index;
    usedIds.add(activityId);

    return { activityId: activityId, scope: scope };
  }

  function getOwnerInfo(card, scope, btn) {
    const scopedOwners = getOwnerLinks(scope);
    const allOwners = getOwnerLinks(card);
    const owner = getNearestByY(scopedOwners.length ? scopedOwners : allOwners, btn);
    if (owner) return { ownerId: owner.id, athleteName: owner.name };

    const ownerEl = scope.querySelector('[data-testid="owners-name"]') || card.querySelector('[data-testid="owners-name"]');
    const name = safeText(ownerEl).substring(0, 80);
    return { ownerId: null, athleteName: name };
  }

  function targetRect(card, scope, btn) {
    const rect = (scope || btn || card).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
    return btn.getBoundingClientRect();
  }

  function targetToFeedCard(card, btn, index, usedIds) {
    const resolved = resolveActivityId(card, btn, index, usedIds);
    const scope = resolved.scope;
    const owner = getOwnerInfo(card, scope, btn);
    const rect = targetRect(card, scope, btn);
    return {
      activityId: resolved.activityId,
      ownerId: owner.ownerId,
      athleteName: owner.athleteName,
      activityTitle: getActivityTitle(scope || card),
      hasKudosButton: true,
      isLiked: isLikedButton(btn),
      isOwn: isOwnActivity(owner.ownerId, owner.athleteName, card),
      isRecent: isRecentActivity(scope || card),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom)
    };
  }

  function linkOnlyFeedCard(card, linkInfo, index) {
    const owner = getNearestByY(getOwnerLinks(card), linkInfo.el) || { id: null, name: '' };
    const rect = linkInfo.el.getBoundingClientRect();
    return {
      activityId: linkInfo.id,
      ownerId: owner.id,
      athleteName: owner.name,
      activityTitle: getActivityTitle(card),
      hasKudosButton: false,
      isLiked: false,
      isOwn: isOwnActivity(owner.id, owner.name, card),
      isRecent: isRecentActivity(card),
      top: Math.round(rect.top || card.getBoundingClientRect().top),
      bottom: Math.round(rect.bottom || card.getBoundingClientRect().bottom)
    };
  }

  function toFeedCards(card) {
    const buttons = getKudosButtons(card);
    if (buttons.length > 0) {
      const usedIds = new Set();
      return buttons.map(function (btn, index) {
        return targetToFeedCard(card, btn, index, usedIds);
      });
    }

    const links = getActivityLinks(card);
    if (links.length > 0) return links.map(function (linkInfo, index) { return linkOnlyFeedCard(card, linkInfo, index); });

    return [];
  }

function getNearViewportCards(margin) {
  return getCards().filter(function (card) {
    return isNearViewportByRect(card.getBoundingClientRect(), margin);
  });
}

function getAllFeedCards() {
  return getCards().flatMap(toFeedCards);
}

function getVisibleFeedCards() {
  return getNearViewportCards(900).flatMap(toFeedCards).filter(function (card) {
    return card.bottom >= 80 && card.top <= (window.innerHeight - 40);
  });
}

function pageInfo() {
    const scrollHeight = Math.max(document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
    return {
      url: window.location.href,
      path: window.location.pathname,
      scrollY: window.scrollY,
      scrollHeight: scrollHeight,
      innerHeight: window.innerHeight,
      isEnd: (window.scrollY + window.innerHeight) >= (scrollHeight - 120)
    };
  }

  function normalizeClubHref(href) {
    const match = (href || '').match(/\/clubs\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const slug = match[1];
    if (['search', 'join', 'create', 'new'].includes(slug)) return null;
    return '/clubs/' + slug;
  }

  function findActivityTab() {
    const selectors = [
      'a[href*="/recent_activity"]', 'a[href*="/activity"]', '[role="tab"]',
      '[data-testid*="tab"]', '.tabs a', '.tab', 'nav a', '[class*="tab"]', 'button[class*="tab"]', '[role="button"]'
    ];
    const tabTexts = ['recent activity', 'последняя тренировка', 'недавняя активность', 'активность клуба', 'activity', 'активность', 'activities', 'лента', 'feed'];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const text = safeText(el).toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        if (href.includes('/recent_activity') || tabTexts.some(function (t) { return text.includes(t); })) return el;
      }
    }
    return null;
  }

  window.StrakudosDom = {
    version: 6,

  scanVisibleCards: function () {
    const info = pageInfo();
    return Object.assign(info, { cards: getVisibleFeedCards() });
  },

    scanAllCards: function () {
      const info = pageInfo();
      return Object.assign(info, { cards: getAllFeedCards() });
    },

  clickKudos: function (activityId) {
    for (const card of getNearViewportCards(1200)) {
        const buttons = getKudosButtons(card);
        const usedIds = new Set();
        for (let i = 0; i < buttons.length; i++) {
          const target = targetToFeedCard(card, buttons[i], i, usedIds);
          if (target.activityId !== activityId) continue;
          if (!buttons[i] || isLikedButton(buttons[i])) return false;
          clickElement(buttons[i]);
          return true;
        }
      }
      return false;
    },

    scrollBy: function (px) {
      window.scrollBy({ top: px, behavior: 'auto' });
      return window.scrollY;
    },

    scrollToTop: function () {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return true;
    },

    reloadPage: function () {
      window.location.reload();
      return true;
    },

    getPageInfo: pageInfo,

    getClubLinks: function () {
      const seen = new Set();
      const clubs = [];
      document.querySelectorAll('a[href*="/clubs/"]').forEach(function (link) {
        const url = normalizeClubHref(link.getAttribute('href') || link.href || '');
        if (!url || seen.has(url)) return;
        seen.add(url);
        clubs.push({ url: url, name: safeText(link).substring(0, 80) || url.replace('/clubs/', '') });
      });
      return clubs;
    },

    goToUrl: function (url) {
      window.location.href = url.startsWith('http') ? url : ('https://www.strava.com' + url);
      return true;
    },

    openClubActivityTab: function () {
      const tab = findActivityTab();
      if (tab) {
        clickElement(tab);
        return true;
      }
      const match = window.location.pathname.match(/\/clubs\/([a-zA-Z0-9_-]+)/);
      if (match) {
        window.location.href = 'https://www.strava.com/clubs/' + match[1] + '/recent_activity';
        return true;
      }
      return false;
    },

    setClubName: function (name) {
      return true;
    }
  };
})();
