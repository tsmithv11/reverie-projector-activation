class CloudGate {
  constructor(saved = {}) {
    this.history = Array.isArray(saved.history) ? saved.history.filter(Number.isFinite).slice(-100) : [];
    this.cooldownAt = Number.isFinite(saved.cooldownAt) ? saved.cooldownAt : this.history.at(-1) || 0;
    this.retryAt = Number.isFinite(saved.retryAt) ? saved.retryAt : 0;
    this.requiresManualRetry = saved.requiresManualRetry === true;
    this.session = 0; this.busy = false; this.previousCooldownAt = this.cooldownAt;
  }
  reason(now, settings, hasKey, manualRetry = false) {
    this.history = this.history.filter(t => t > now - 3600000 && t <= now + 60000);
    if (!settings.robotEnabled) return 'disabled';
    if (!hasKey) return 'missing-key';
    if (this.busy) return 'busy';
    if (this.session >= settings.robotSessionCap) return 'session-cap';
    if (this.history.length >= 12) return 'hour-cap';
    if (this.requiresManualRetry) {
      if (now < this.retryAt) return 'provider-wait';
      if (!manualRetry) return 'manual-retry';
    }
    if (now - this.cooldownAt < settings.robotMinutes * 60000) return 'cooldown';
    return '';
  }
  reserve(now, settings, hasKey, manualRetry = false) {
    const reason = this.reason(now, settings, hasKey, manualRetry); if (reason) return reason;
    this.previousCooldownAt = this.cooldownAt; this.cooldownAt = now;
    this.requiresManualRetry = false; this.retryAt = 0;
    this.busy = true; this.session++; this.history.push(now); return '';
  }
  rejectConcurrency(now) {
    // Retain the attempt in both spending caps. A refused connection should not
    // add a full scene interval, but an earlier real session's interval still applies.
    this.cooldownAt = this.previousCooldownAt;
    this.requiresManualRetry = true; this.retryAt = now + 60000;
  }
  snapshot() { return { history: this.history, cooldownAt: this.cooldownAt, retryAt: this.retryAt, requiresManualRetry: this.requiresManualRetry }; }
  finish() { this.busy = false; }
}
module.exports = { CloudGate };
