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
      if ( typeof(popup) != 'string' ) popup = 'Warning!';
      this.popup(popup,msg);
    }
  },
  
  // from errorUtils.js
  dumpValue: function(value, i, recurse, compress, pfx, tee, level, map) {
    let t = "", s= "";
    try { t = typeof(value); }
    catch (err) { s += pfx + tee + " (exception) " + err + "\n"; }
    switch (t) {
      case "function":
        let sfunc = String(value).split("\n");
        if ( String(value).match(/^\s+\[native code\]$/m) )
          sfunc = "[native code]";
        else
          sfunc = sfunc.length + " lines";
        s += pfx + tee + i + " (function) " + map + sfunc + "\n";
        break;
      case "object":
        s += pfx + tee + i + " (object) " + map + value + "\n";
        if (!compress)
          s += pfx + "|\n";
        if ((i != "parent") && (recurse) && value != null)
          s += this.objectTreeAsString(value, recurse - 1, compress, level + 1);
        break;
      case "string":
        if (value.length > 8192 + 5)
          s += pfx + tee + i + " (" + t + ")" + map + "'" + value.substr(0, 8192) + "' ... (" + value.length + " chars)\n";
        else
          s += pfx + tee + i + " (" + t + ")" + map + "'" + value + "'\n";
        break;
      case "":
        break;
      default:
        s += pfx + tee + i + " (" + t + ") " + map + value + "\n";
    }
    if (!compress)  s += pfx + "|\n";
    return s;
  },
  ignoreArray: new Array(),
  ignoreMap: new Map(),
  ignoreString: new String(),
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
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects
        let objectToInspect, properties = [], _listed = {};
        for( objectToInspect = o; objectToInspect !== null; objectToInspect = Object.getPrototypeOf(objectToInspect) )
          properties = properties.concat(Object.getOwnPropertyNames(objectToInspect));
        for ( let i of properties ) {
          try {
            if ( i in _listed || i in this.ignoreArray || i in this.ignoreMap || i in this.ignoreString ) continue;
            _listed[i] = true;
            s += this.dumpValue(o[i], i, recurse, compress, pfx, tee, level, '');
          } catch (ex) { s += pfx + tee + " (exception) " + ex + "\n"; }
        }
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map, Map is not Object        
        if ( typeof(o.keys) == 'function' && typeof(o.get) == 'function' ) {
          for ( let i of o.keys() ) {
            try {
              if ( i in _listed || i in this.ignoreArray || i in this.ignoreMap || i in this.ignoreString ) continue;
              _listed[i] = true;
              s += this.dumpValue(o.get(i), i, recurse, compress, pfx, tee, level, ' => ');
            } catch (ex) { s += pfx + tee + " (exception) " + ex + "\n"; }
          }
        }
        // nsIMsgDBHdr
        if ( typeof(o.propertyEnumerator) == 'object' && typeof(o.getStringProperty) == 'function' ) {
          let e = o.propertyEnumerator;
          while ( e.hasMore() ) {
            let i = e.getNext();
            s += this.dumpValue(o.getStringProperty(i), i, recurse, compress, pfx, tee, level, ' -> ');
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
    if (!this.verbose) return;
    this._checked = [];
    this.info(name + ": " + ( typeof(obj) == 'object' ? ( Array.isArray(obj) ? 'Array' : obj ) : '' ) + "\n" + this.objectTreeAsString(obj,maxDepth,true));
    this._checked = [];
  },
  
  logException: function(e, popup) {
    let msg = "";
    if ( 'name' in e && 'message' in e ) msg += e.name + ": " + e.message + "\n";
    if ( 'stack' in e ) msg += e.stack;
    if ( 'location' in e ) msg += e.location + "\n";
    if ( msg == '' ) msg += " " + e + "\n";
    msg = 'Caught Exception ' + msg;
    let fileName= e.fileName || e.filename || ( Cs.caller && Cs.caller.filename );
    let lineNumber= e.lineNumber || ( Cs.caller && Cs.caller.lineNumber );
    let sourceLine= e.sourceLine || ( Cs.caller && Cs.caller.sourceLine );
    let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
    scriptError.init(msg, fileName, sourceLine, lineNumber, e.columnNumber, scriptError.errorFlag, "chrome javascript");
    Services.console.logMessage(scriptError);
    if ( typeof(popup) == 'undefined' || popup ) this.popup("Exception", msg);
  },
  
};
