class CloudGate {
  constructor(saved = {}) { this.history = Array.isArray(saved.history) ? saved.history.filter(Number.isFinite).slice(-100) : []; this.session = 0; this.busy = false; }
  reason(now, settings, hasKey) {
    this.history = this.history.filter(t => t > now - 3600000 && t <= now + 60000);
    if (!settings.robotEnabled) return 'disabled';
    if (!hasKey) return 'missing-key';
    if (this.busy) return 'busy';
    if (this.session >= settings.robotSessionCap) return 'session-cap';
    if (this.history.length >= 12) return 'hour-cap';
    if (now - (this.history.at(-1) || 0) < settings.robotMinutes * 60000) return 'cooldown';
    return '';
  }
  reserve(now, settings, hasKey) { const reason = this.reason(now, settings, hasKey); if (reason) return reason; this.busy = true; this.session++; this.history.push(now); return ''; }
  finish() { this.busy = false; }
}
module.exports = { CloudGate };
