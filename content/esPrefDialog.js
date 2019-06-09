"use strict";
function onLoad() {
  let folderPicker = document.getElementById("esNewFolderPicker");
  if ( folderPicker.value == '' ) return;
  let msgFolder = ExpressionSearchCommon.getFolder(folderPicker.value);
  if ( !msgFolder ) return;
  try {
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
  let gPickedFolder = aEvent.target._folder || aEvent.target;
  let label = gPickedFolder.prettyName || gPickedFolder.label;
  let value = gPickedFolder.URI || gPickedFolder.value;
  let folderPicker = document.getElementById("esNewFolderPicker");
  folderPicker.value = value; // must set value before set label, or next line may fail when previous value is empty
  folderPicker.setAttribute("label", label); 
  folderPicker.setAttribute('tooltiptext', showPrettyTooltip(value, label));
}

// The new Preferences can't make instantApply for each item easily, and it will be default for all OSes
// So here just force it
Preferences.forceEnableInstantApply();
Preferences.addAll([
  {id: "extensions.expressionsearch.hide_normal_filer", type: "bool"},
  {id: "extensions.expressionsearch.act_as_normal_filter", type: "bool"},
  {id: "extensions.expressionsearch.showbuttonlabel", type: "int", instantApply: "true"}, // instantApply here has no effect
  {id: "extensions.expressionsearch.results_label_size", type: "int", instantApply: "true"},
  {id: "extensions.expressionsearch.reuse_existing_folder", type: "bool"},
  {id: "extensions.expressionsearch.load_virtual_folder_in_tab", type: "bool"},
  {id: "extensions.expressionsearch.search_timeout", type: "int"},
  {id: "extensions.expressionsearch.select_msg_on_enter", type: "bool"},
  {id: "extensions.expressionsearch.move2bar", type: "int", instantApply: "true"},
  {id: "extensions.expressionsearch.c2s_enableCtrl", type: "bool"},
  {id: "extensions.expressionsearch.c2s_enableShift", type: "bool"},
  {id: "extensions.expressionsearch.c2s_enableCtrlReplace", type: "bool"},
  {id: "extensions.expressionsearch.c2s_enableShiftReplace", type: "bool"},
  {id: "extensions.expressionsearch.c2s_regexpMatch", type: "string"},
  {id: "extensions.expressionsearch.c2s_regexpReplace", type: "string"},
  {id: "extensions.expressionsearch.c2s_removeDomainName", type: "bool"},
  {id: "extensions.expressionsearch.enable_verbose_info", type: "bool"},
  {id: "extensions.expressionsearch.enable_statusbar_info", type: "bool"},
  {id: "extensions.expressionsearch.statusbar_info_showtime", type: "int"},
  {id: "extensions.expressionsearch.statusbar_info_hidetime", type: "int"},
  {id: "extensions.expressionsearch.virtual_folder_path", type: "string"},
  {id: "mailnews.customHeaders", type: "string"},
  {id: "mailnews.customDBHeaders", type: "string"},
]);