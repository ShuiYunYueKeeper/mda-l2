/**
 * 跨预览/源码模式共享的查找状态（F12-2 / M8-A4b 骨架）。
 */
'use strict';

/**
 * @typedef {{ start: number, end: number }} TextMatch
 */

class SearchSession {
  constructor() {
    /** @type {string} */
    this.query = '';
    this.caseSensitive = false;
    this.regex = false;
    /** @type {TextMatch[]} */
    this.matches = [];
    this.matchIndex = -1;
    this.total = 0;
  }

  /**
   * @param {Partial<Pick<SearchSession, 'query'|'caseSensitive'|'regex'|'matchIndex'>>} patch
   */
  applyOptions(patch) {
    if (patch.query != null) this.query = String(patch.query);
    if (patch.caseSensitive != null) this.caseSensitive = !!patch.caseSensitive;
    if (patch.regex != null) this.regex = !!patch.regex;
    if (patch.matchIndex != null) this.matchIndex = patch.matchIndex;
  }

  /**
   * @param {TextMatch[]} matches
   * @param {number} [index]
   */
  setMatches(matches, index) {
    this.matches = Array.isArray(matches) ? matches.slice() : [];
    this.total = this.matches.length;
    if (index != null) {
      this.matchIndex = index;
    } else if (this.matchIndex >= this.total) {
      this.matchIndex = this.total ? this.total - 1 : -1;
    } else if (this.matchIndex < 0 && this.total > 0) {
      this.matchIndex = 0;
    }
  }

  /** @returns {TextMatch | null} */
  currentMatch() {
    if (this.matchIndex < 0 || this.matchIndex >= this.matches.length) return null;
    return this.matches[this.matchIndex];
  }

  /** @param {boolean} [backward] */
  stepMatch(backward) {
    if (!this.matches.length) {
      this.matchIndex = -1;
      return null;
    }
    if (backward) {
      this.matchIndex = (this.matchIndex - 1 + this.matches.length) % this.matches.length;
    } else {
      this.matchIndex = (this.matchIndex + 1) % this.matches.length;
    }
    return this.currentMatch();
  }

  toJSON() {
    return {
      query: this.query,
      caseSensitive: this.caseSensitive,
      regex: this.regex,
      matchIndex: this.matchIndex,
      total: this.total,
    };
  }
}

module.exports = {
  SearchSession: SearchSession,
};
