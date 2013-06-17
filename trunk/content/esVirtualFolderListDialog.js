"use strict";

const { classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr, manager: Cm } = Components;
//Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
//Cu.import("resource://app/modules/gloda/utils.js");
//Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://expressionsearch/aop.js");
Cu.import("resource://expressionsearch/log.js");

let esVirtualFolderSelector = {
  hookedFunctions: [],
  Load: function() {
    try {
      window.removeEventListener("load", esVirtualFolderSelector.Load, false);
      // How to deal with multi select and reverse?
      esVirtualFolderSelector.hookedFunctions.push( ExpressionSearchaop.around( {target: window, method: 'ReverseStateFromNode'}, function(invocation) {
        let typeSel = document.getElementById('esFolderType');
        let row = invocation.arguments[0];
        ExpressionSearchLog.log('ReverseStateFromNode: ' + row + ":" + typeSel.value);
        if ( !typeSel || typeSel.value == 0 || !gFolderPickerTree.view.isContainer(row) || gFolderPickerTree.view.isContainerEmpty(row) ) return invocation.proceed();
        
        let folder = GetFolderResource(row).QueryInterface(Ci.nsIMsgFolder);
        if ( !folder ) return false;
        //ExpressionSearchLog.logObject(folder,'folder',0);
        //ExpressionSearchLog.logObject(folder.rootFolder,'root',0);
        let type = typeSel.value;
        let result = invocation.proceed(); // change folder's state first
        esVirtualFolderSelector.changeSubFolder(type, folder);
        return result;
      })[0] );
    } catch (err) {
      ExpressionSearchLog.logException(err);
    }
  },
  
  changeSubFolder: function(type, folder) {
    try {
      for each (let child in fixIterator(folder.subFolders, Ci.nsIMsgFolder)) {
        child.setInVFEditSearchScope( folder.inVFEditSearchScope, false /* subscope, not implemented */ );
        if ( type == 2 && child.hasSubFolders && child.numSubFolders > 0 ) {
          esVirtualFolderSelector.changeSubFolder(type, child);
        }
      }
    } catch (err) {
      ExpressionSearchLog.logException(err);
    }
  },
  
  changeAllFolder: function(state) {
    let allFolders = MailServices.accounts.allFolders;
    for (let folder in fixIterator(allFolders, Ci.nsIMsgFolder)) // not including server itself
      folder.setInVFEditSearchScope(state, false);
    
    if ( !state ) return;    
    for (let i = 0; i < MailServices.accounts.length; i++) { // just for better looking
      let account = accounts.queryElementAt(i, Ci.nsIMsgAccount);
      account.incomingServer.rootFolder.setInVFEditSearchScope(state, false);
    }
    ExpressionSearchLog.log('done',1);
  },

};

window.addEventListener("load", esVirtualFolderSelector.Load, false);
