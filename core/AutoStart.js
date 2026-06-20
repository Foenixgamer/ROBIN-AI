const { app } = require('electron');

class AutoStart {
  isEnabled() {
    const settings = app.getLoginItemSettings({ name: 'Robin' });
    return settings.openAtLogin;
  }

  enable() {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      name: 'Robin',
      path: process.execPath,
      args: ['--hidden'],
    });
    return true;
  }

  disable() {
    app.setLoginItemSettings({ openAtLogin: false, name: 'Robin' });
    return true;
  }

  toggle() {
    if (this.isEnabled()) {
      this.disable();
      return false;
    }
    this.enable();
    return true;
  }
}

module.exports = { AutoStart };
