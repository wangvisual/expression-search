// Opera Wang, 2010/1/15
// GPL V3 / MPL
// debug utils
"use strict";
const { classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr, manager: Cm, stack: Cs } = Components;
Cu.import("resource://gre/modules/Services.jsm");
const popupImage = "chrome://expressionsearch/skin/statusbar_icon.png";
var EXPORTED_SYMBOLS = ["ExpressionSearchLog"];
let ExpressionSearchLog = {
  popup: function(title, msg) {
    // alert-service won't work with bb4win, use xul instead
    let win = Services.ww.openWindow(null, 'chrome://global/content/alerts/alert.xul', '_blank', 'chrome,titlebar=no,popup=yes', null);
    win.arguments = [popupImage, title, msg, false, ''];
  },
  
  now: function() { //author: meizz
    let format = "yyyy-MM-dd hh:mm:ss.SSS ";
    let time = new Date();
    let o = {
      "M+" : time.getMonth()+1, //month
      "d+" : time.getDate(),    //day
      "h+" : time.getHours(),   //hour
      "m+" : time.getMinutes(), //minute
      "s+" : time.getSeconds(), //second
      "q+" : Math.floor((time.getMonth()+3)/3),  //quarter
      "S+" : time.getMilliseconds() //millisecond
    }
    
    if(/(y+)/.test(format)) format=format.replace(RegExp.$1,
      (time.getFullYear()+"").substr(4 - RegExp.$1.length));
    for(let k in o)if(new RegExp("("+ k +")").test(format))
      format = format.replace(RegExp.$1,
        RegExp.$1.length==1 ? o[k] :
          ("000"+ o[k]).substr((""+ o[k]).length+3-RegExp.$1.length));
    return format;
  },
  
  verbose: false,
  setVerbose: function(verbose) {
    this.verbose = verbose;
  },

  info: function(msg,popup,force) {
    if (!force && !this.verbose) return;
    this.log(this.now() + msg,popup,true);
  },

  log: function(msg,popup,info) {
    if ( ( typeof(info) != 'undefined' && info ) || !Components || !Cs || !Cs.caller ) {
      Services.console.logStringMessage(msg);
    } else {
      let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
      scriptError.init(msg, Cs.caller.filename, Cs.caller.sourceLine, Cs.caller.lineNumber, 0, scriptError.warningFlag, "chrome javascript");
      Services.console.logMessage(scriptError);
    }
    if (popup) {
      if ( typeof(popup) == 'number' ) popup = 'Warning!';
      this.popup(popup,msg);
    }
  },
  
  // from errorUtils.js
  dumpValue: function(value, i, recurse, compress, pfx, tee, level) {
    let t = "", s= "";
    try { t = typeof(value); }
    catch (err) { s += pfx + tee + " (exception) " + err + "\n"; }
    switch (t) {
      case "function":
        let sfunc = String(value).split("\n");
        if ( typeof(sfunc[2]) != 'undefined' && sfunc[2] == "    [native code]" )
          sfunc = "[native code]";
        else
          sfunc = sfunc.length + " lines";
        s += pfx + tee + i + " (function) " + sfunc + "\n";
        break;
      case "object":
        s += pfx + tee + i + " (object) " + value + "\n";
        if (!compress)
          s += pfx + "|\n";
        if ((i != "parent") && (recurse) && value != null)
          s += this.objectTreeAsString(value, recurse - 1, compress, level + 1);
        break;
      case "string":
        if (value.length > 8192)
          s += pfx + tee + i + " (" + t + ") " + value.length + " chars\n";
        else
          s += pfx + tee + i + " (" + t + ") '" + value + "'\n";
        break;
      case "":
        break;
      default:
        s += pfx + tee + i + " (" + t + ") " + value + "\n";
    }
    if (!compress)  s += pfx + "|\n";
    return s;
  },
  objectTreeAsString: function(o, recurse, compress, level) {
    let s = "";
    let pfx = "";
    let tee = "";
    try {
      if (recurse === undefined) recurse = 0;
      if (level === undefined) level = 0;
      if (compress === undefined) compress = true;
      
      for (let junk = 0; junk < level; junk++)
        pfx += (compress) ? "| " : "|  ";
      tee = (compress) ? "+ " : "+- ";
      if ( typeof(o) != 'undefined' && o != null ) {
        let index = this._checked.indexOf(o);
        if ( index >= 0 ) return pfx + tee + '[already shown]\n';
        else this._checked.push(o);
      }
      if (typeof(o) != "object" || o == null ) s += pfx + tee + " (" + typeof(o) + ") " + o + "\n";
      else {
        for ( let i of Object.getOwnPropertyNames(o) ) {
          s += this.dumpValue(o[i], i, recurse, compress, pfx, tee, level);
        }
        if ( typeof(o.keys) == 'function' &&  typeof(o.get) == 'function' ) {
          for ( let i of o.keys() ) {
            s += this.dumpValue(o.get(i), i, recurse, compress, pfx, tee, level);
          }
        }
      }
    } catch (ex) {
      s += pfx + tee + " (exception) " + ex + "\n";
      //this.logException(ex);
    }
    s += pfx + "*\n";
    return s;
  },
  
  logObject: function(obj, name, maxDepth, curDepth) {
    this._checked = [];
    this.info(name + ":\n" + this.objectTreeAsString(obj,maxDepth,true));
    this._checked = [];
  },
  
  logException: function(e, popup) {
    let msg = "";
    if ( typeof(e.name) != 'undefined' && typeof(e.message) != 'undefined' ) {
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
    msg = 'Caught Exception ' + msg;
    let fileName= e.fileName || e.filename || Cs.caller.filename;
    let lineNumber= e.lineNumber || Cs.caller.lineNumber;
    let sourceLine= e.sourceLine || Cs.caller.sourceLine;
    let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
    scriptError.init(msg, fileName, sourceLine, lineNumber, e.columnNumber, scriptError.errorFlag, "chrome javascript");
    Services.console.logMessage(scriptError);
    if ( typeof(popup) == 'undefined' || popup ) this.popup("Exception", msg);
  },
  
};
