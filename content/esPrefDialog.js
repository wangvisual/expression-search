"use strict";
function onLoad() {
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
  return preference.value !== undefined ? preference.value : preference.defaultValue;
}