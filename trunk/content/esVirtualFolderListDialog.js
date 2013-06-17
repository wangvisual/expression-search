"use strict";

const { classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr, manager: Cm } = Components;
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/iteratorUtils.jsm");
Cu.import("resource://expressionsearch/aop.js");
Cu.import("resource://expressionsearch/log.js");

let esVirtualFolderSelector = {
  hookedFunctions: [],
  Load: function() {
    try {
      window.removeEventListener("load", esVirtualFolderSelector.Load, false);
      // How to deal with multi select and reverse?
      esVirtualFolderSelector.hookedFunctions.push( ExpressionSearchaop.around( {target: window, method: 'ReverseStateFromNode'}, function(invocation) {
        let result = invocation.proceed(); // change folder's state first
        let typeSel = document.getElementById('esFolderType');
        let row = invocation.arguments[0];
        let folder = GetFolderResource(row).QueryInterface(Ci.nsIMsgFolder);
        if ( !typeSel || typeSel.value == 0 || !gFolderPickerTree.view.isContainer(row) || gFolderPickerTree.view.isContainerEmpty(row) || !folder) return result;
        esVirtualFolderSelector.changeSubFolder(typeSel.value, folder);
        return result;
      })[0] );
    } catch (err) {
      ExpressionSearchLog.logException(err);
    }
  },
  
  changeSubFolder: function(type, folder) {
    try {
      for (let child in fixIterator(folder.subFolders, Ci.nsIMsgFolder)) {
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
    try {
      // not work for TB 5 & not inclue root dir
      //let allFolders = MailServices.accounts.allFolders;
      //for (let folder in fixIterator(allFolders, Ci.nsIMsgFolder))
      //  folder.setInVFEditSearchScope(state, false);
      let accounts = MailServices.accounts.accounts;
      for ( let account in fixIterator(accounts, Ci.nsIMsgAccount) ) {
        account.incomingServer.rootFolder.setInVFEditSearchScope(state, false);
        esVirtualFolderSelector.changeSubFolder(2, account.incomingServer.rootFolder);
      }
    } catch (err) {
      ExpressionSearchLog.logException(err);
    }
  },

};

window.addEventListener("load", esVirtualFolderSelector.Load, false);
