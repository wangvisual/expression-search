// Common functions
// MPL/GPL
// Opera.Wang 2011/03/21
"use strict";
Cu.import("resource://gre/modules/Services.jsm");
try {
  Cu.import("resource:///modules/MailServices.jsm");
} catch (err) {
  Cu.import("resource:///modules/mailServices.js");
}
var EXPORTED_SYMBOLS = ["ExpressionSearchCommon"];
var ExpressionSearchCommon = {
  strings: Services.strings.createBundle('chrome://expressionsearch/locale/ExpressionSearch.properties'),
  translateURL: function(url,anchor) {
    if ( typeof(anchor) == 'undefined' ) anchor = '';
    if ( url.indexOf(':') != -1 )
      return url+anchor;
    try {
      return ExpressionSearchCommon.strings.GetStringFromName(url)+anchor;
    } catch (e) {
      return url+anchor;
    }
  },
  loadURL: function(url, name = null, additional = '') { // not support html anchor
    let win = Services.ww.openWindow(null, ExpressionSearchCommon.translateURL(url), name, "chrome=no,menubar=no,status=no,location=no,resizable,scrollbars,centerscreen" + additional, null);
  },
  showModalDialog: function(win, url) {
      // open is more standard compare with openDialog
      win.open(url, "_blank", "chrome,dialog,modal");
  },
  getTabObject: function() {
    let tabmail;
    // Try opening new tabs in an existing 3pane window
    let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
    if (mail3PaneWindow) {
      tabmail = mail3PaneWindow.document.getElementById("tabmail");
      mail3PaneWindow.focus();
    }
    return tabmail;
  },
  loadTab: function(url,anchor) {
    let args = { type: 'contentTab' };
    let tabmail = ExpressionSearchCommon.getTabObject();
    if ( typeof(url) == 'object' ) {
        args = url;
    } else {
        args.contentPage = ExpressionSearchCommon.translateURL(url,anchor);
    }
    if (tabmail)
      tabmail.openTab( args.type, args );
    else
      this.loadURL(args.contentPage || args.folder);
  },
  loadUseProtocol: function(url) {
    Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].getService(Components.interfaces.nsIExternalProtocolService).loadURI(Services.io.newURI(url, null, null), null);
  },
  loadDonate: function(pay) {
    let url = "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=893LVBYFXCUP4&lc=US&item_name=Expression%20Search&no_note=0&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_LG%2egif%3aNonHostedGuest";
    if ( typeof(pay) != 'undefined' ) {
      if ( pay == 'alipay' ) return this.loadTab( {type: 'contentTab', contentPage: "chrome://expressionsearch/content/qr-alipay.png"});
      if ( pay == 'paypal' ) url = "https://www.paypal.me/operawang/4.99USD";
      if ( pay == 'mozilla' ) url = "https://addons.thunderbird.net/thunderbird/addon/gmailui"; // addon home page
    }
    ExpressionSearchCommon.loadUseProtocol(url);
  },
  sendEmailWithTB: function(url) {
      MailServices.compose.OpenComposeWindowWithURI(null, Services.io.newURI(url, null, null));
  }
}
