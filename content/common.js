// Common functions
// MPL/GPL
// Opera.Wang 2011/03/21
"use strict";
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
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
  loadInTopWindow: function(url,anchor) {
    //openDialog will open another top window
    window.openDialog("chrome://messenger/content/", "_blank", "chrome,dialog=no,all", null,
      { tabType: "contentTab", tabParams: {contentPage: ExpressionSearchCommon.translateURL(url,anchor) } });
  },
  getTabObject: function() {
    let tabmail = document.getElementById("tabmail");
    if (!tabmail) {
      // Try opening new tabs in an existing 3pane window
      let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
      if (mail3PaneWindow) {
        tabmail = mail3PaneWindow.document.getElementById("tabmail");
        mail3PaneWindow.focus();
      }
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
      url = "https://me.alipay.com/operawang";
      if ( pay == 'mozilla' ) url = "https://addons.mozilla.org/en-US/thunderbird/addon/gmailui/developers?src=api"; // Meet the developer page
    }
    ExpressionSearchCommon.loadUseProtocol(url);
  },
  sendEmailWithTB: function(url) {
      MailServices.compose.OpenComposeWindowWithURI(null, Services.io.newURI(url, null, null));
  }
}
