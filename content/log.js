// Opera Wang, 2010/1/15
// GPL V3 / MPL
// debug utils
var ExpressionSearchLog = {
  log: function(msg) {
    var console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
    console.logStringMessage(msg);
  },
  
  // from errorUtils.js
  objectTreeAsString: function(o, recurse, compress, level) {
    let s = "";
    if (recurse === undefined)
      recurse = 0;
    if (level === undefined)
      level = 0;
    if (compress === undefined)
      compress = true;
    let pfx = "";

    for (var junk = 0; junk < level; junk++)
      pfx += (compress) ? "| " : "|  ";

    let tee = (compress) ? "+ " : "+- ";

    if (typeof(o) != "object") {
      s += pfx + tee + " (" + typeof(o) + ") " + o + "\n";
    }
    else {
      for (let i in o) {
        try {
          let t = typeof o[i];
          switch (t) {
            case "function":
              let sfunc = String(o[i]).split("\n");
              if (sfunc[2] == "    [native code]")
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
            default:
              s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";
          }
        } catch (ex) {
          s += pfx + tee + " (exception) " + ex + "\n";
        }
        if (!compress)
          s += pfx + "|\n";
      }
    }
    s += pfx + "*\n";
    return s;
  },
  
  logObject: function(obj, name, maxDepth, curDepth)
  {
    this.log(name + ":\n" + this.objectTreeAsString(obj,maxDepth,true));
  },
  
  logException: function(e) {
    var msg = "Caught Exception"
    if ( e.name && e.message ) {
      msg += " " + e.name + ": " + e.message + "\n";
    }
    if ( e.stack ) {
      msg += e.stack;
    } else if ( e.fileName && e.lineNumber ) {
      msg += "@ " + e.fileName + ":" + e.lineNumber + "\n";
    }
    this.log(msg);
  },
};
