// Opera Wang, 2010/1/15
// GPL V3 / MPL
// debug utils
"use strict";
var EXPORTED_SYMBOLS = ["ExpressionSearchLog"];

Components.utils.import("resource://gre/modules/Services.jsm");

var ExpressionSearchLog = {
  popup: function(title, msg) {
    var image = "chrome://expressionsearch/skin/statusbar_icon.png";
    // alert-service won't work with bb4win, use xul instead
    /*try {
      Components.classes['@mozilla.org/alerts-service;1'].
                getService(Components.interfaces.nsIAlertsService).
                showAlertNotification(image, title, msg, false, '', null, "");
    } catch(e) {
      // prevents runtime error on platforms that don't implement nsIAlertsService
      this.logException(e);
    }*/
    var win = Services.ww.openWindow(null, 'chrome://global/content/alerts/alert.xul', '_blank', 'chrome,titlebar=no,popup=yes', null);
    win.arguments = [image, title, msg, false, ''];
  },
  
  info: function(msg,popup) {
    let verbose = true;
    try {
      verbose = Services.prefs.getBranch("extensions.expressionsearch.").getBoolPref("enable_verbose_info");
    } catch(e){}
    if (verbose) this.log(msg,popup);
  },

  log: function(msg,popup) {
    Services.console.logStringMessage(msg);
    if ( typeof(popup)!='undefined' ) {
      if ( typeof(popup) == 'number' ) popup = 'Warning!';
      this.popup(popup,msg);
    }
  },
  
  // from errorUtils.js
  objectTreeAsString: function(o, recurse, compress, level) {
    let s = "";
    let pfx = "";
    let tee = "";
    try {
      if (recurse === undefined)
        recurse = 0;
      if (level === undefined)
        level = 0;
      if (compress === undefined)
        compress = true;
      
      for (let junk = 0; junk < level; junk++)
        pfx += (compress) ? "| " : "|  ";
      
      tee = (compress) ? "+ " : "+- ";
      
      if (typeof(o) != "object") {
        s += pfx + tee + " (" + typeof(o) + ") " + o + "\n";
      }
      else {
        for (let i in o) {
          let t = "";
          try {
            t = typeof(o[i]);
          } catch (err) {
            s += pfx + tee + " (exception) " + err + "\n";
          }
          switch (t) {
            case "function":
              let sfunc = String(o[i]).split("\n");
              if ( typeof(sfunc[2]) != 'undefined' && sfunc[2] == "    [native code]" )
                sfunc = "[native code]";
              else
                sfunc = sfunc.length + " lines";
              s += pfx + tee + i + " (function) " + sfunc + "\n";
              break;
            case "object":
              s += pfx + tee + i + " (object) " + o[i] + "\n";
              if (!compress)
                s += pfx + "|\n";
              if ((i != "parent") && (recurse))
                s += this.objectTreeAsString(o[i], recurse - 1,
                                             compress, level + 1);
              break;
            case "string":
              if (o[i].length > 200)
                s += pfx + tee + i + " (" + t + ") " + o[i].length + " chars\n";
              else
                s += pfx + tee + i + " (" + t + ") '" + o[i] + "'\n";
              break;
            case "":
              break;
            default:
              s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";
          }
          if (!compress)
            s += pfx + "|\n";
        }
      }
    } catch (ex) {
      s += pfx + tee + " (exception) " + ex + "\n";
    }
    s += pfx + "*\n";
    return s;
  },
  
  logObject: function(obj, name, maxDepth, curDepth) {
    this.info(name + ":\n" + this.objectTreeAsString(obj,maxDepth,true));
  },

  logException: function(e) {
    let scriptError = Components.classes["@mozilla.org/scripterror;1"].createInstance(Components.interfaces.nsIScriptError);
    let msg = "Caught Exception ";
    if ( e.name && e.message ) {
      msg += e.name + ": " + e.message + "\n";
    }
    if ( e.stack ) {
      msg += e.stack;
    }
    if ( e.location ) {
      msg += e.location + "\n";
    }
    if ( msg == '' ){
      msg += " " + e + "\n";
    }
    let fileName= e.fileName || e.filename || Components.stack.caller.filename;
    let lineNumber= e.lineNumber || Components.stack.caller.lineNumber;
    let sourceLine= e.sourceLine || Components.stack.caller.sourceLine;
    scriptError.init(msg, fileName, sourceLine, lineNumber, e.columnNumber, scriptError.errorFlag, "chrome javascript");
    Services.console.logMessage(scriptError);
    this.popup("Exception", msg);
  },

};
