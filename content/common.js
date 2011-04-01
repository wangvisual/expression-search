// Common functions
// MPL/GPL
// Opera.Wang 2011/03/21
Components.utils.import("resource:///modules/StringBundle.js");
var ExpressionSearchCommon = {
  strings: new StringBundle("chrome://expressionsearch/locale/ExpressionSearch.properties"),
  translateURL: function(url,anchor) {
    if ( typeof(anchor) == 'undefined' ) anchor = '';
    if ( url.indexOf(':') != -1 )
      return url+anchor;
    try {
      return ExpressionSearchCommon.strings.get(url)+anchor;
      alert(1);
    } catch (e) {
      return url+anchor;
    }
  },
  loadURL: function(url) { // not support html anchor
    var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].getService(Components.interfaces.nsIWindowWatcher);
    ww.openWindow(null, ExpressionSearchCommon.translateURL(url) ,"Help", "chrome=no,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,centerscreen", null);
  },
  loadInTopWindow: function(url,anchor) {
    //openDialog will open another top window
    window.openDialog("chrome://messenger/content/", "_blank", "chrome,dialog=no,all", null,
      { tabType: "contentTab", tabParams: {contentPage: ExpressionSearchCommon.translateURL(url,anchor) } });
  },
  loadTab: function(url,anchor) {
    let tabmail = document.getElementById("tabmail");
    if (!tabmail) {
      // Try opening new tabs in an existing 3pane window
      let mail3PaneWindow = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                                      .getService(Components.interfaces.nsIWindowMediator)
                                      .getMostRecentWindow("mail:3pane");
      if (mail3PaneWindow) {
        tabmail = mail3PaneWindow.document.getElementById("tabmail");
        mail3PaneWindow.focus();
      }
    }
    if (tabmail)
      tabmail.openTab("contentTab", {contentPage: ExpressionSearchCommon.translateURL(url,anchor)});
    else
      this.loadURL(url);
  },
  sendEmail: function(url) {
    var uri = Components.classes["@mozilla.org/network/simple-uri;1"].getService(Components.interfaces.nsIURI);
    uri.spec = url;
    Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].getService(Components.interfaces.nsIExternalProtocolService).loadUrl(uri);
  },
  sendEmailWithTB: function(url) {
	  var msgComposeService=Components.classes["@mozilla.org/messengercompose;1"].getService(Components.interfaces.nsIMsgComposeService);
	  // make the URI
	  var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	  aURI = ioService.newURI(url, null, null);
	  // open new message
	  msgComposeService.OpenComposeWindowWithURI(null, aURI);
  }
}
