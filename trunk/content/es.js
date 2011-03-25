// Original by Ken Mixter for GMailUI, which is "GMailUI is completely free to use as you wish."
// Opera Wang, 2010/1/15
// GPL V3 / MPL

if ( typeof(ExpressionSearchChrome) != 'undefined' ) {
  throw "Expression Search already defined";
}

let ExpressionSearchChrome = {

  // if last key is Enter
  isEnter: 0,
  
  needMoveIds: ["qfb-sticky", "quick-filter-bar-collapsible-buttons", "qfb-results-label", "expression-search-textbox"],
  collapsibleButtons: ["qfb-unread", "qfb-starred", "qfb-inaddrbook", "qfb-tags", "qfb-attachment"],
  textBoxDomId: "expression-search-textbox",
  
  prefs: null, // preference object
  options: {   // preference strings
    savedPosition: 0,
  },

  init: function() {
        this.importModules();
        this.initPerf();
        this.initFunctionHook();
  },
  
  importModules: function() {
    this.Cu = Components.utils;
    this.Ci = Components.interfaces;
    this.Cc = Components.classes;
    //this.Cr = Components.results;
    this.Cu.import("resource://expressionsearch/log.js");
    ExpressionSearchLog.log("Expression Search: init...");
    this.Cu.import("resource://expressionsearch/gmailuiParse.js");
    this.Cu.import("resource:///modules/StringBundle.js");
    // for create quick search folder
    this.Cu.import("resource:///modules/virtualFolderWrapper.js");
    this.Cu.import("resource:///modules/iteratorUtils.jsm");
    // need to know whehter gloda enabled
    this.Cu.import("resource:///modules/gloda/indexer.js");
    // to call gloda search, actually no need
    //Cu.import("resource:///modules/gloda/msg_search.js");
    this.Cu.import("resource://expressionsearch/ExpressionSearchFilter.js");
  },
  
  initPerf: function() {
    this.prefs = this.Cc["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
         .getBranch("extensions.expressionsearch.");
    this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
    this.prefs.addObserver("", this, false);
    try {
      this.options.hide_normal_filer = this.prefs.getBoolPref("hide_normal_filer");
      this.options.hide_filter_label = this.prefs.getBoolPref("hide_filter_label");
      this.options.act_as_normal_filter = this.prefs.getBoolPref("act_as_normal_filter");
      this.options.reuse_existing_folder = this.prefs.getBoolPref("reuse_existing_folder");
      this.options.select_msg_on_enter = this.prefs.getBoolPref("select_msg_on_enter");
      this.options.move2bar = this.prefs.getIntPref("move2bar"); // 0:keep, 1:toolbar, 2:menubar
      this.options.c2s_enableCtrl = this.prefs.getBoolPref("c2s_enableCtrl");
      this.options.c2s_enableShift = this.prefs.getBoolPref("c2s_enableShift");
      this.options.c2s_regexpMatch = this.prefs.getComplexValue('c2s_regexpMatch',this.Ci.nsISupportsString).data;
      this.options.c2s_regexpReplace = this.prefs.getComplexValue('c2s_regexpReplace',this.Ci.nsISupportsString).data;
    } catch ( err ) {
      ExpressionSearchLog.logException(err);
    }
  },
  
  // get called when event occurs with our perf branch
  observe: function(subject, topic, data) {
    if (topic != "nsPref:changed") {
       return;
     }
     switch(data) {
       case "hide_normal_filer":
       case "hide_filter_label":
       case "act_as_normal_filter":
       case "reuse_existing_folder":
       case "select_msg_on_enter":
       case "c2s_enableCtrl":
       case "c2s_enableShift":
         this.options[data] = this.prefs.getBoolPref(data);
         break;
       case "move2bar":
         this.options[data] = this.prefs.getIntPref(data);
         break;
       case "c2s_regexpMatch":
       case "c2s_regexpReplace":
         this.options[data] = this.prefs.getComplexValue(data,this.Ci.nsISupportsString).data;
         break;
     }
     if ( data=='hide_normal_filer' || data=='hide_filter_label' || data == 'move2bar' )
       this.refreshFilterBar();
  },
  
  initFunctionHook: function() {
    if ( typeof(QuickFilterBarMuxer) == 'undefined' || typeof(QuickFilterBarMuxer.reflectFiltererState) == 'undefined' )
      return;
    QuickFilterBarMuxer.reflectFiltererStateSaved = QuickFilterBarMuxer.reflectFiltererState;
    QuickFilterBarMuxer.reflectFiltererState = function(aFilterer, aFolderDisplay, aFilterName) {
      let show = ( ExpressionSearchChrome.options.move2bar==0 || !ExpressionSearchChrome.options.hide_normal_filer );
      let hasFilter = typeof(this.maybeActiveFilterer)=='object';
      // filter bar not need show, so hide mainbar(in refreshFilterBar) and show quick filter bar
      if ( !show  && !aFilterer.visible && hasFilter ) aFilterer.visible = true;
      QuickFilterBarMuxer.reflectFiltererStateSaved.apply(QuickFilterBarMuxer,arguments);
    }
    
    // onMakeActive && onTabSwitched
    QuickFilterBarMuxer.onMakeActiveSaved = QuickFilterBarMuxer.onMakeActive;
    QuickFilterBarMuxer.onMakeActive = function(aFolderDisplay) {
      let tab = aFolderDisplay._tabInfo;
      let appropriate = ("quickFilter" in tab._ext) && aFolderDisplay.displayedFolder && !aFolderDisplay.displayedFolder.isServer;
      ExpressionSearchChrome.needMoveIds.concat(ExpressionSearchChrome.collapsibleButtons).forEach( function(ID, index, array) {
        document.getElementById(ID).style.visibility = appropriate ? 'visible': 'hidden';
      } );
      QuickFilterBarMuxer.onMakeActiveSaved.apply(this,arguments);
    }
    QuickFilterBarMuxer.onTabSwitchedSaved = QuickFilterBarMuxer.onTabSwitched;
    QuickFilterBarMuxer.onTabSwitched = function(aTab, aOldTab) {
      let filterer = this.maybeActiveFilterer;
      if (!filterer) {
        ExpressionSearchChrome.needMoveIds.concat(ExpressionSearchChrome.collapsibleButtons).forEach( function(ID, index, array) {
          document.getElementById(ID).style.visibility = 'hidden';
      } );
      }
      QuickFilterBarMuxer.onTabSwitchedSaved.apply(this,arguments);
    }
    
  },

  unregister: function() {
    ExpressionSearchLog.log("Expression Search: unload...");
    ExpressionSearchChrome.prefs.removeObserver("", ExpressionSearchChrome);
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( aNode && aNode.removeEventListener ) {
        aNode.removeEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true);
        aNode.removeEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
    }
    let threadPane = document.getElementById("threadTree");
    if ( threadPane && threadPane.RemoveEventListener )
      threadPane.RemoveEventListener("click", ExpressionSearchChrome.onClicked, true);
    if ( typeof(QuickFilterBarMuxer.reflectFiltererStateSaved) != 'undefined' ) {
      QuickFilterBarMuxer.reflectFiltererState = QuickFilterBarMuxer.reflectFiltererStateSaved;
      QuickFilterBarMuxer.onMakeActive = QuickFilterBarMuxer.onMakeActiveSaved;
      QuickFilterBarMuxer.onTabSwitched = QuickFilterBarMuxer.onTabSwitchedSaved;
    }
    window.removeEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
    window.removeEventListener("unload", ExpressionSearchChrome.unregister, false);
  },
  
  refreshFilterBar: function() {
    //thunderbird-private-tabmail-buttons
    //  qfb-show-filter-bar  : document.getElementById("qfb-show-filter-bar").checked = aFilterer.visible;
  
    //quick-filter-bar
    //  quick-filter-bar-main-bar
    //  quick-filter-bar-expando
    //    quick-filter-bar-tab-bar : it's taG bar
    //    quick-filter-bar-filter-text-bar.collapsed=(aFilterValue.text == null);
    
    //qfb-sticky [quick-filter-bar-collapsible-buttons] [100 results] [search filter]
    //                                          subject ...
    
    //QuickFilterState.visible
    
    //QuickFilterBarMuxer
    //  onMakeActive for qfb-show-filter-bar visiable
    //  reflectFiltererState for qfb-show-filter-bar checked
    let filterNode = document.getElementById('qfb-qs-textbox');
    if ( filterNode && filterNode.style ) {
      filterNode.style.display = this.options.hide_normal_filer ? 'none' : '';
    }
    if ( filterNode && ExpressionSearchChrome.options.hide_normal_filer ) // hide normal filter, so reset it
      filterNode.value = '';
    let filterLabel = document.getElementById('qfb-filter-label');
    if ( filterLabel && filterLabel.style ) {
      filterLabel.style.display = this.options.hide_filter_label ? 'none' : '';
    }
    let spacer = document.getElementById('qfb-filter-bar-spacer');
    if ( spacer ) {
      spacer.flex = this.options.hide_filter_label ? 1 : 200;
    }
    let show = ( this.options.move2bar==0 || !this.options.hide_normal_filer );
    let mainbar = document.getElementById("quick-filter-bar-main-bar");
    mainbar.collapsed = show ? false: true; // only me will change mainbar status, TB won't

    // move expression search box along with other buttons to dest position
    if ( this.options.move2bar == this.options.savedPosition ) return;
    let dest = "quick-filter-bar-main-bar";
    let reference = null;
    if ( this.options.move2bar == 0 )
      reference = document.getElementById("qfb-filter-label");
    else if ( this.options.move2bar == 1 )
      dest = 'mail-bar3';
    else if ( this.options.move2bar == 2 )
      dest = 'mail-toolbar-menubar2';
    var toolbar = document.getElementById(dest);
    var i = 0;
    while ( i < this.needMoveIds.length ) {
        var needMove = document.getElementById(this.needMoveIds[i]);
        toolbar.insertBefore(needMove.parentNode.removeChild(needMove), reference);
        i++;
        if ( this.options.move2bar == 0 )
          if ( i == 1 )
            reference = document.getElementById("qfb-filter-bar-spacer");
          else if ( i == 2 )
            reference = document.getElementById("qfb-qs-textbox");
          else if ( i == 3 )
            reference = null;
    }
    this.options.savedPosition = this.options.move2bar;
  },
  
  hideUpsellPanel: function() {
    let panel = document.getElementById("qfb-text-search-upsell");
    if ( panel.state == "open")
      panel.hidePopup();
  },
  

  onSearchKeyPress: function(event){
    ExpressionSearchChrome.isEnter = 0;
    if ( event && ( ( event.DOM_VK_RETURN && event.keyCode==event.DOM_VK_RETURN ) || ( event.DOM_VK_ENTER && event.keyCode==event.DOM_VK_ENTER ) ) ) {
      ExpressionSearchChrome.isEnter = 1;
      let panel = document.getElementById("qfb-text-search-upsell");
      let searchValue = this.value; // this is aNode/my search text box
      if ( typeof(searchValue) != 'undefined' && searchValue != '' ) {
        if ( GlodaIndexer.enabled && ( panel.state=="open" || event.shiftKey || searchValue.toLowerCase().indexOf('g:') == 0 ) ) { // gloda
          searchValue = ExperssionSearchFilter.expression2gloda(searchValue);
          if ( searchValue != '' ) {
            //this._fireCommand(this); // just for selection, but no use as TB will unselect it
            let tabmail = document.getElementById("tabmail");
            tabmail.openTab("glodaFacet", {
              searcher: new GlodaMsgSearcher(null, searchValue)
            });
          }
        } else if ( event.ctrlKey || event.metaKey ) { // create quick search folder
          ExperssionSearchFilter.latchQSFolderReq = ExpressionSearchChrome;
          this._fireCommand(this);
        } else {
          var e = compute_expression(searchValue);
          if (e.kind == 'spec' && e.tok == 'calc') {
            ExpressionSearchChrome.isEnter = 0; // showCalculationResult also will select the result.
            ExpressionSearchChrome.showCalculationResult(e);
          }
        }
      }
    } // end of IsEnter
    ExpressionSearchChrome.hideUpsellPanel(); // hide the panel when key press
    // -- Keypresses for focus transferral
    if ( event && event.DOM_VK_DOWN && ( event.keyCode == event.DOM_VK_DOWN ) )
      ExpressionSearchChrome.selectFirstMessage(true);
  },

  initSearchInput: function() {
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( aNode ) {
      aNode.addEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true); // false will be after onComand, too later, 
      aNode.addEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
    }
  },
  
  // not works well for complex searchTerms. But it's for all folders.
  createQuickFolder: function(searchTerms) {
    const nsMsgFolderFlags = this.Ci.nsMsgFolderFlags;
    var currFolder = gFolderDisplay.displayedFolder;
    var currURI = currFolder.URI;
    var rootFolder = currFolder.rootFolder;
    var QSFolderName = "ExpressionSearch";
    var uriSearchString = "";
    if (!rootFolder) {
      alert('Expression Search: Cannot determine root folder of search');
      return;
    }
    var QSFolderURI = rootFolder.URI + "/" + QSFolderName;
    
    if ( !rootFolder.containsChildNamed(QSFolderName) || ! this.options.reuse_existing_folder ) {
      var allFolders = this.Cc["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
      rootFolder.ListDescendents(allFolders);
      var numFolders = allFolders.Count();
      for (var folderIndex = 0; folderIndex < numFolders; folderIndex++) {
        var folder = allFolders.GetElementAt(folderIndex).QueryInterface(Components.interfaces.nsIMsgFolder);
        var uri = folder.URI;
        // only add non-virtual non-new folders
        if ( !folder.isSpecialFolder(nsMsgFolderFlags.Newsgroup,false) && !folder.isSpecialFolder(nsMsgFolderFlags.Virtual,false) ) {
          if (uriSearchString != "") {
            uriSearchString += "|";
          }
          uriSearchString += uri;
        }
      }
    }

    //Check if folder exists already
    if (rootFolder.containsChildNamed(QSFolderName)) {
      // modify existing folder
      var msgFolder = GetMsgFolderFromUri(QSFolderURI);
      if (!msgFolder.isSpecialFolder(nsMsgFolderFlags.Virtual,false)) {
        alert('Expression Search: Non search folder '+QSFolderName+' is in the way');
        return;
      }
      // save the settings
      let virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(msgFolder);
      virtualFolderWrapper.searchTerms = searchTerms;
      if ( ! this.options.reuse_existing_folder ) {
        virtualFolderWrapper.searchFolders = uriSearchString;
      }
      virtualFolderWrapper.onlineSearch = false;
      virtualFolderWrapper.cleanUpMessageDatabase();
      var accountManager = this.Cc["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager);
      accountManager.saveVirtualFolders();
    } else {
      VirtualFolderHelper.createNewVirtualFolder(QSFolderName, rootFolder, uriSearchString, searchTerms, false);
    }

    if (currURI == QSFolderURI) {
      // select another folder to force reload of our virtual folder
      SelectFolder(rootFolder.getFolderWithFlags(nsMsgFolderFlags.Inbox).URI);
    }
    SelectFolder(QSFolderURI);
  },

  // select first message, expand first container if closed
  selectFirstMessage: function(needSelect) {
    if ( typeof(gFolderDisplay)!='undefined' && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject && gFolderDisplay.tree.treeBoxObject.view ) {
      let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
      let treeView = treeBox.view; //nsITreeView
      let dbViewWrapper = gFolderDisplay.view; // DBViewWrapper
      let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
      if ( aNode && treeView && dbViewWrapper && treeView.rowCount > 0 ) {
        if ( treeView.isContainer(0) && !treeView.isContainerOpen(0))
          treeView.toggleOpenState(0);
        if ( needSelect ) {
          let threadPane = document.getElementById("threadTree");
          // focusing does not actually select the row...
          threadPane.focus();
          // ...so explicitly select the currentIndex if avaliable or the 1st one
          //threadPane.view.selection.select(threadPane.currentIndex);
          var row = treeView.isContainer(0)&&dbViewWrapper.showGroupedBySort ? 1 : 0;
          treeView.selection.select(row);
          treeBox.ensureRowIsVisible(row);
        } // needSelect
      } // rowCount > 0
    }
    ExpressionSearchChrome.isEnter = false;
  },
  
  calculateResult: function(e) {
    if (e.kind == 'op') {
      if (e.tok == '+' || (e.right != undefined && e.tok == '-') || e.tok == '*' || e.tok == '/') {
        var r1 = this.calculateResult(e.left);
        var r2 = this.calculateResult(e.right);
        if (r1.kind == 'error')
          return r1;
        else if (r2.kind == 'error')
          return r2;
        else {
          if (e.tok == '+')
            return { kind: 'num', tok: r1.tok+r2.tok };
          else if (e.tok == '-')
            return { kind: 'num', tok: r1.tok-r2.tok };
          else if (e.tok == '*')
            return { kind: 'num', tok: r1.tok*r2.tok };
          else if (e.tok == '/') {
            // divide by zero is okay, it just results in infinity
            return { kind: 'num', tok: r1.tok/r2.tok };
          }
        }
      } else if (e.tok == '-') {
        var r1 = calculateResult(e.left);
        if (r1.kind == 'error')
          return r1;
        else
          return { kind: 'num', tok: -r1.tok };
      }
    } else if (e.kind == 'num') {
      return e;
    } else {
      ExpressionSearchLog.log('Expression Search: unexpected expression tree when calculating result',1);
      return { kind: 'error', tok: 'internal' };
    }
  },

  showCalculationResult: function(e) {
    e = e.left; // skip the calc: specifier
    // compute the result of this calculation
    var r = this.calculateResult(e);
    // print the expression,
    var lhs = expr_tostring_infix(e);
    var rhs = '' + ((r.kind == 'num') ? r.tok : "<<ERROR: "+r.tok+">>");
    var x = document.getElementById('expression-search-textbox');
    x.value = lhs + " = " + rhs;
    x.setSelectionRange(lhs.length, lhs.length + rhs.length + 3);
  },
  
  //Check conditions for search: corresponding modifier is hold on or middle button is pressed
  CheckClickSearchEvent: function( event ) {
    // event.button: 0:left, 1:middle, 2:right
    if ( event.button != 2 ) return false;
    if ( ExpressionSearchChrome.options.c2s_enableCtrl && event.ctrlKey ) return true;
    if ( ExpressionSearchChrome.options.c2s_enableShift && event.shiftKey ) return true;
    return false;
  },
  
  //Replace string using user-defined regexp. If not match, return original strings. 
  //If multiple matches, return all replaces, concatinated with OR operator
  RegexpReplaceString : function( str ) {
      if ( ExpressionSearchChrome.options.c2s_regexpMatch.length == 0 ) return str;
      var regexp = new RegExp(ExpressionSearchChrome.options.c2s_regexpMatch, "gi");
      var r_match = str.match(regexp);
      if ( !r_match ) return str;
      var res = new Array();
      for (i = 0; i < r_match.length; i++ ) {
          res.push( r_match[i].replace(regexp, ExpressionSearchChrome.options.c2s_regexpReplace) );
      }
      var out = res.join(" or ");
      if ( res.length > 1)
        out = "(" + out + ")";
      return out;
  },
  
  onClicked: function(event) {
    if ( !event.currentTarget || !event.currentTarget.treeBoxObject || !event.currentTarget.view ) return;
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( !aNode ) return;
    if ( ! ExpressionSearchChrome.CheckClickSearchEvent(event) ) return;
    var row = {}; var col = {}; var childElt = {};
    event.currentTarget.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, childElt);
    if ( !row || !col || typeof(row.value)=='undefined' || typeof(col.value)=='undefined' ) return;
    // col.value.id: subjectCol, senderCol, recipientCol (may contains multi recipient, Comma Seprated), tagsCol, sio_inoutaddressCol (ShowInOut)
    let token = "";
    let sCellText = event.currentTarget.view.getCellText(row.value, col.value);
    switch(col.value.id) {
       case "subjectCol":
         sCellText = ExpressionSearchChrome.RegexpReplaceString( sCellText );
         token = "simple";
         if ( sCellText.indexOf("(") == 0 )
           token = "s";
         let oldValue = "";
         while ( oldValue != sCellText ) {
           oldValue = sCellText;
           [/^\s*\S{2,3}(?::|：)\s*(.*)$/, /^\s*\[.+\]:*\s*(.*)$/, /^\s+(.*)$/].forEach( function(element, index, array) {
             sCellText = sCellText.replace(element, '$1');
           });
         }
         break;
       case "senderCol":
         token = "f";
         break;
       case "recipientCol":
         token = "t";
         //break;
       case "sio_inoutaddressCol": //showInOut support
         if ( token == "" && gFolderDisplay && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject ) { // not recipientCol
           let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
           let treeView = treeBox.view;
           var property = ExpressionSearchChrome.Cc["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
           var atomIn = ExpressionSearchChrome.Cc["@mozilla.org/atom-service;1"].getService(Components.interfaces.nsIAtomService).getAtom('in');
           treeView.getCellProperties(row.value,col.value,property);
           token = property.GetIndexOf(atomIn) >= 0 ? "f" : "t";
         }
         sCellText = sCellText.replace(/'/g, '');
         // and, or, 1st, mouse position?
         if ( sCellText.indexOf(',') != -1 ) {
           sCellText = sCellText.replace(/,/g, ' and');
           sCellText = "(" + sCellText + ")";
         }
         break;
       case "tagsCol":
         token = "tag";
         sCellText = sCellText.replace(/\s+/g, ' and '); //maybe not correct for "To Do"
         sCellText = "(" + sCellText + ")";
         break;
       default:
         return;
    }
    if ( sCellText == "" ) return;
    if ( ExpressionSearchChrome.options.move2bar==0 && ( !QuickFilterBarMuxer.activeFilterer.visible || document.commandDispatcher.focusedElement != aNode.inputField ) )
      QuickFilterBarMuxer._showFilterBar(true);
    ExpressionSearchLog.log(token + ":" + sCellText);
    aNode.value = token + ":" + sCellText;
    ExpressionSearchChrome.isEnter = true; // So the email can be selected
    aNode._fireCommand(aNode);
    // Stop even bubbling
    event.preventDefault();
    event.stopPropagation();
  },
  
  initAfterLoad: function() {
    ExpressionSearchChrome.initSearchInput();
    ExpressionSearchChrome.refreshFilterBar();
    let threadPane = document.getElementById("threadTree");
    if ( threadPane )
      threadPane.addEventListener("click", ExpressionSearchChrome.onClicked, true);
  },

};

//onload is too late for me to init
// this is much complex than 'ExpressionSearchChrome.init();' and both works ;-)
(function() { this.init(); }).apply(ExpressionSearchChrome);
window.addEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
window.addEventListener("unload", ExpressionSearchChrome.unregister, false);

// TODO:
// use https://developer.mozilla.org/en/STEEL ? maybe not