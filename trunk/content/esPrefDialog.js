"use strict";
function onLoad() {
  if ( Services.vc.compare(Application.version, "19") < 0) { // bug 363238
    // AddEventListner not works here, also setAttribute is too late
    // document.getElementById("customHeadersText").setAttribute("onsyncfrompreference", "return onSyncFromPreference();");
    document.getElementById("tooltip_customHeaders").style.display = "none";
  }
  var folderPicker = document.getElementById("esNewFolderPicker");
  if ( folderPicker.value == '' ) return;
  var msgFolder = {};
  try {
    msgFolder = MailUtils.getFolderForURI(folderPicker.value);
    document.getElementById("esNewFolderPopup").selectFolder(msgFolder); // not a issue, validator will false alarm on this line
  } catch(e) {
    folderPicker.setAttribute("label", msgFolder.prettyName);
  }
  folderPicker.setAttribute('tooltiptext', showPrettyTooltip(msgFolder.ValueUTF8||msgFolder.value, msgFolder.prettyName));
}

function showPrettyTooltip(URI,pretty) {
  return decodeURIComponent(URI).replace(/(.*\/)[^/]*/, '$1') + pretty;
}

function onFolderPick(aEvent) {
  var gPickedFolder = aEvent.target._folder || aEvent.target;
  var label = gPickedFolder.prettyName || gPickedFolder.label;
  var value = gPickedFolder.URI || gPickedFolder.value;
  var folderPicker = document.getElementById("esNewFolderPicker");
  folderPicker.value = value; // must set value before set label, or next line may fail when previous value is empty
  folderPicker.setAttribute("label", label); 
  folderPicker.setAttribute('tooltiptext', showPrettyTooltip(value, label));
}

function onSyncFromPreference() {
  var preference = document.getElementById("pref_customHeaders");
  // .value === undefined means the preference is set to the default value
  var actualValue = preference.value !== undefined ? preference.value : preference.defaultValue;
  // actualValue may be |null| here if the pref didn't have the default value.
  if ( Services.vc.compare(Application.version, "19") >= 0 ) return actualValue; // bug 363238
  var currentHeaders = document.getElementById("customHeadersText").value.split(/: /);
  var inputHeaders = actualValue.split(/: /);
  var customDBHeaders = Services.prefs.getCharPref("mailnews.customDBHeaders").split(" ");
  var added = 0;
  var removed = 0;
  // all inputHeaders need be in customeDBHeaders
  // If some value was removed, need removed in DBHeaders too
  inputHeaders.forEach( function(header, index, array) {
    if ( customDBHeaders.indexOf(header.toLowerCase()) < 0 ) {
      customDBHeaders.push(header.toLowerCase());
      added = 1;
    }
  } );
  currentHeaders.forEach( function(header, index, array) {
    if ( inputHeaders.indexOf(header) < 0 && customDBHeaders.indexOf(header.toLowerCase()) >= 0 ) {
      customDBHeaders.splice( customDBHeaders.indexOf(header.toLowerCase()), 1 );
      removed = 1;
    }
  } );
  if ( added || removed ) Services.prefs.setCharPref("mailnews.customDBHeaders", customDBHeaders.sort().join(" ").trim());
  if ( added ) {
    //Services.prompt.alert(window, "Warning", "New added, need repair folder");
  }
  return actualValue;
}