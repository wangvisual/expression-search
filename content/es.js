// Original by Ken Mixter for GMailUI, which is "GMailUI is completely free to use as you wish."
// Opera Wang, 2010/1/15
// GPL V3 / MPL

if ( typeof(ExpressionSearchChrome) != 'undefined' ) {
  throw "Expression Search already defined";
}

let ExpressionSearchChrome = {
  // inited, also used as ID for the instance
  isInited:0,

  // if last key is Enter
  isEnter: 0,
  
  needMoveId: "quick-filter-bar-main-bar",
  textBoxDomId: "expression-search-textbox",
  
  prefs: null, // preference object
  options: {   // preference strings
    savedPosition: 0,
  },

  init: function() {
    this.Cu = Components.utils;
    this.Cu.import("resource://expressionsearch/log.js"); // load log first
    try {
      if ( this.isInited == 0 ) {
        ExpressionSearchLog.info("Expression Search: init...");
        this.isInited = new Date().getTime();
        this.importModules();
        this.initPerf();
        this.initFunctionHook();
      } else ExpressionSearchLog.log("Expression Search:Warning, init again",1);
    } catch (err) {
      ExpressionSearchLog.logException(err);
    }
  },
  
  importModules: function() {
    this.Ci = Components.interfaces;
    this.Cc = Components.classes;
    //this.Cr = Components.results;
    this.Cu.import("resource://expressionsearch/log.js");
    this.Cu.import("resource://expressionsearch/gmailuiParse.js");
    this.Cu.import("resource://expressionsearch/aop.js");
    // for hook functions for attachment search
    this.Cu.import("resource:///modules/searchSpec.js");
    // general services
    this.Cu.import("resource://gre/modules/Services.jsm");
    this.Cu.import("resource:///modules/mailServices.js");
    // for create quick search folder
    this.Cu.import("resource:///modules/virtualFolderWrapper.js");
    this.Cu.import("resource:///modules/iteratorUtils.jsm");
    this.Cu.import("resource:///modules/gloda/utils.js"); // for GlodaUtils.parseMailAddresses
    // need to know whehter gloda enabled
    this.Cu.import("resource:///modules/gloda/indexer.js");
    // to call gloda search, actually no need
    //Cu.import("resource:///modules/gloda/msg_search.js");
    this.Cu.import("resource://expressionsearch/ExpressionSearchFilter.js");
  },
  
  initPerf: function() {
    this.prefs = Services.prefs.getBranch("extensions.expressionsearch.");
    this.prefs.addObserver("", this, false);
    try {
      this.options.hide_normal_filer = this.prefs.getBoolPref("hide_normal_filer");
      this.options.hide_filter_label = this.prefs.getBoolPref("hide_filter_label");
      this.options.act_as_normal_filter = this.prefs.getBoolPref("act_as_normal_filter");
      this.options.reuse_existing_folder = this.prefs.getBoolPref("reuse_existing_folder");
      this.options.select_msg_on_enter = this.prefs.getBoolPref("select_msg_on_enter");
      this.options.move2bar = this.prefs.getIntPref("move2bar"); // 0:keep, 1:toolbar, 2:menubar
      this.options.showbuttonlabel = this.prefs.getIntPref("showbuttonlabel"); // 0:auto 1:force show 2:force hide
      this.options.c2s_enableCtrl = this.prefs.getBoolPref("c2s_enableCtrl");
      this.options.c2s_enableShift = this.prefs.getBoolPref("c2s_enableShift");
      this.options.c2s_regexpMatch = this.prefs.getComplexValue('c2s_regexpMatch',this.Ci.nsISupportsString).data;
      this.options.c2s_regexpReplace = this.prefs.getComplexValue('c2s_regexpReplace',this.Ci.nsISupportsString).data;
      this.options.installed_version = this.prefs.getComplexValue('installed_version',this.Ci.nsISupportsString).data;
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
       case "showbuttonlabel":
         this.options[data] = this.prefs.getIntPref(data);
         break;
       case "c2s_regexpMatch":
       case "c2s_regexpReplace":
         this.options[data] = this.prefs.getComplexValue(data,this.Ci.nsISupportsString).data;
         break;
     }
     if ( data=='hide_normal_filer' || data=='hide_filter_label' || data == 'move2bar' || data == 'showbuttonlabel' )
       this.refreshFilterBar();
  },

  hookedFunctions: [],
  initFunctionHook: function() {
    if ( typeof(QuickFilterBarMuxer) == 'undefined' || typeof(QuickFilterBarMuxer.reflectFiltererState) == 'undefined' ) return;
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.around( {target: QuickFilterBarMuxer, method: 'reflectFiltererState'}, function(invocation) {
        let show = ( ExpressionSearchChrome.options.move2bar==0 || !ExpressionSearchChrome.options.hide_normal_filer );
        let hasFilter = typeof(this.maybeActiveFilterer)=='object';
        let aFilterer = invocation.arguments[0];
        // filter bar not need show, so hide mainbar(in refreshFilterBar) and show quick filter bar
        if ( !show  && !aFilterer.visible && hasFilter ) aFilterer.visible = true;
        return invocation.proceed();
    })[0] );
    
    // onMakeActive && onTabSwitched: show or hide the buttons & search box
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.around( {target: QuickFilterBarMuxer, method: 'onMakeActive'}, function(invocation) {
      let aFolderDisplay = invocation.arguments[0];
      let tab = aFolderDisplay._tabInfo;
      let appropriate = ("quickFilter" in tab._ext) && aFolderDisplay.displayedFolder && !aFolderDisplay.displayedFolder.isServer;
      document.getElementById(ExpressionSearchChrome.needMoveId).style.visibility = appropriate ? 'visible': 'hidden';
      document.getElementById("qfb-results-label").style.visibility = appropriate ? 'visible': 'hidden';
      return invocation.proceed();
    })[0] );
    
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.before( {target: QuickFilterBarMuxer, method: 'onTabSwitched'}, function() {
      let filterer = this.maybeActiveFilterer;
      // filterer means if the tab can use quick filter
      // filterer.visible means if the quick search bar is visible
      document.getElementById(ExpressionSearchChrome.needMoveId).style.visibility = filterer /*&& filterer.visible*/ ? 'visible': 'hidden';
      document.getElementById("qfb-results-label").style.visibility = filterer /*&& filterer.visible*/ ? 'visible': 'hidden';
    })[0] );
    
    // hook _flattenGroupifyTerms to avoid being flatten
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.around( {target: SearchSpec.prototype, method: '_flattenGroupifyTerms'}, function(invocation) {
      let aTerms = invocation.arguments[0];
      let aCloneTerms = invocation.arguments[1];
      let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
      if ( !aNode || !aNode.value ) return invocation.proceed();
      let outTerms = aCloneTerms ? [] : aTerms;
      let term;
      if ( aCloneTerms ) {
        for (term in fixIterator(aTerms, Components.interfaces.nsIMsgSearchTerm)) {
          let cloneTerm = this.session.createTerm();
          cloneTerm.attrib = term.attrib;
          cloneTerm.value = term.value;
          cloneTerm.arbitraryHeader = term.arbitraryHeader;
          cloneTerm.hdrProperty = term.hdrProperty;
          cloneTerm.customId = term.customId;
          cloneTerm.op = term.op;
          cloneTerm.booleanAnd = term.booleanAnd;
          cloneTerm.matchAll = term.matchAll;
          cloneTerm.beginsGrouping = term.beginsGrouping;
          cloneTerm.endsGrouping = term.endsGrouping;
          term = cloneTerm;
          outTerms.push(term);
        }
      }
      return outTerms;
    })[0] );
    
    // for results label to show correct color by copy filterActive attribute from quick-filter-bar to qfb-results-label, and set color in overlay.css
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.after( {target: QuickFilterBarMuxer, method: 'reflectFiltererResults'}, function(result) {
      let qfb = document.getElementById("quick-filter-bar");
      let resultsLabel = document.getElementById("qfb-results-label");
      if ( qfb && resultsLabel ) {
        resultsLabel.setAttribute( "filterActive", qfb.getAttribute("filterActive") || '' );
      }
      return result;
    })[0] );
    
    // hook associateView & dissociateView for search attachment, once I don't need to implement my self, this shit can be dumped.
    if ( typeof(SearchSpec) == 'undefined' || typeof(SearchSpec.prototype.associateView) == 'undefined' || typeof(SearchSpec.prototype.associateViewSaved) != 'undefined' )
      return;
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.around( {target: SearchSpec.prototype, method: 'associateView'}, function(invocation) {
      let self = this;
      let args = invocation.arguments;
      if ( ExpressionSearchVariable.startreq == Number.MAX_VALUE )
        ExpressionSearchVariable.startreq = new Date().getTime();
      if ( ExpressionSearchVariable.resuming || ExpressionSearchVariable.stopping || ExpressionSearchVariable.startreq > ExpressionSearchVariable.stopreq ) {
        window.setTimeout( function(){self.associateView.apply(self,args);}, 10  );
        return;
      }
      ExpressionSearchVariable.starting = true;
      ExpressionSearchVariable.stopped = false;
      invocation.proceed();
      ExpressionSearchVariable.starting = false;
      ExpressionSearchVariable.startreq = Number.MAX_VALUE;
    })[0] );
    
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.around( {target: SearchSpec.prototype, method: 'dissociateView'}, function(invocation) {
      let self = this;
      let args = invocation.arguments;
      if ( ExpressionSearchVariable.stopreq == Number.MAX_VALUE )
        ExpressionSearchVariable.stopreq = new Date().getTime();
      if ( ExpressionSearchVariable.resuming || ExpressionSearchVariable.starting || ExpressionSearchVariable.stopreq > ExpressionSearchVariable.startreq ) {
        window.setTimeout( function(){self.dissociateView.apply(self,args);}, 10  );
        return;
      }
      ExpressionSearchVariable.stopping = true;
      invocation.proceed();
      ExpressionSearchVariable.stopped = true;
      ExpressionSearchVariable.stopping = false;
      ExpressionSearchVariable.stopreq = Number.MAX_VALUE;
    })[0] );
    
  },

  unregister: function() {
    ExpressionSearchLog.info("Expression Search: unload...");
    ExpressionSearchChrome.prefs.removeObserver("", ExpressionSearchChrome);
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( aNode && aNode.removeEventListener ) {
        aNode.removeEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true);
        aNode.removeEventListener("click", ExpressionSearchChrome.onTokenChange, true);
        aNode.removeEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
        aNode.removeEventListener("click", ExpressionSearchChrome.onSearchBarFocus, true);
    }
    let threadPane = document.getElementById("threadTree");
    if ( threadPane && threadPane.RemoveEventListener )
      threadPane.RemoveEventListener("click", ExpressionSearchChrome.onClicked, true);
    ExpressionSearchChrome.hookedFunctions.forEach( function(hooked, index, array) {
      hooked.unweave();
    } );
    window.removeEventListener("unload", ExpressionSearchChrome.unregister, false);
  },
  
  refreshFilterBar: function() {
    //thunderbird-private-tabmail-buttons
    //  qfb-show-filter-bar  : document.getElementById("qfb-show-filter-bar").checked = aFilterer.visible;
  
    //quick-filter-bar
    //  quick-filter-bar-main-bar
    //    qfb-sticky qfb-filter-label [quick-filter-bar-collapsible-buttons] [100 results] [search filter]
    //  quick-filter-bar-expando
    //    quick-filter-bar-tab-bar : it's taG bar
    //    quick-filter-bar-filter-text-bar.collapsed=(aFilterValue.text == null);
    //QuickFilterState.visible
    
    //QuickFilterBarMuxer
    //  onMakeActive for qfb-show-filter-bar visiable
    //  reflectFiltererState for qfb-show-filter-bar checked
    let filterNode = document.getElementById('qfb-qs-textbox');
    if ( filterNode && filterNode.style ) {
      filterNode.style.display = this.options.hide_normal_filer ? 'none' : '';
      filterNode.setAttribute('width', this.options.move2bar == 0 ? 100 : 320);
      filterNode.setAttribute('minwidth', this.options.move2bar == 0 ? 80 : 280);
    }
    if ( filterNode && ExpressionSearchChrome.options.hide_normal_filer ) // hide normal filter, so reset it
      filterNode.value = '';
    let filterLabel = document.getElementById('qfb-filter-label');
    if ( filterLabel && filterLabel.style ) {
      filterLabel.style.display = this.options.hide_filter_label ? 'none' : '';
    }

    // move expression search box along with other buttons to dest position
    if ( this.options.move2bar != this.options.savedPosition ) {
      this.options.savedPosition = this.options.move2bar;
      let dest = 'quick-filter-bar';
      let reference = null;
      if ( this.options.move2bar == 0 )
        reference = document.getElementById("quick-filter-bar-expando");
      else if ( this.options.move2bar == 1 ) {
        dest = 'mail-bar3';
        reference = document.getElementById('qfb-show-filter-bar');
      }
      else if ( this.options.move2bar == 2 )
        dest = 'mail-toolbar-menubar2';
      let toolbar = document.getElementById(dest);
      let needMove = document.getElementById(ExpressionSearchChrome.needMoveId);
      toolbar.insertBefore(needMove.parentNode.removeChild(needMove), reference);
    }
    
    let collapsible = document.getElementById('quick-filter-bar-collapsible-buttons');
    if ( collapsible && collapsible.classList ) {
      collapsible.classList.remove("hidelabel");
      collapsible.classList.remove("showlabel");
      if ( this.options.showbuttonlabel == 1 ) {
        collapsible.classList.add("showlabel");
      } else if ( this.options.showbuttonlabel == 2 ) {
        collapsible.classList.add("hidelabel");
      } else if ( this.options.showbuttonlabel == 0 ) {
        // auto show/hide collapsible buttons
        if ( QuickFilterBarMuxer._buttonLabelsCollapsed ) {
          QuickFilterBarMuxer._minExpandedBarWidth = 0; // let it re-calculate the min expanded bar width because we changed the layout
          QuickFilterBarMuxer.onWindowResize.apply(QuickFilterBarMuxer);
        } else {
          let quickFilterBarBox = document.getElementById("quick-filter-bar-main-bar"); 
          if ( quickFilterBarBox && quickFilterBarBox.clientWidth < quickFilterBarBox.scrollWidth ) {
            QuickFilterBarMuxer.onOverflow.apply(QuickFilterBarMuxer);
          }
        }
      }
    }
  },
  
  hideUpsellPanel: function() {
    let panel = document.getElementById("qfb-text-search-upsell");
    if ( panel.state == "open")
      panel.hidePopup();
  },
  
  helpTimer: 0,

  showHideHelp: function(show, line1, line2, line3, line4) {
    if ( typeof(document) == 'undefined' || typeof(document.defaultView) == 'undefined' ) return;
    let tooltip = document.getElementById("expression-search-tooltip");
    let tooltip1 = document.getElementById("expression-search-tooltip-line1");
    let tooltip2 = document.getElementById("expression-search-tooltip-line2");
    let tooltip3 = document.getElementById("expression-search-tooltip-line3");
    let tooltip4 = document.getElementById("expression-search-tooltip-line4");
    let statusbaricon = document.getElementById("status-bar-expressionsearch");
    if ( tooltip && tooltip1 && tooltip2 && tooltip3 && tooltip4 && statusbaricon ) {
      if ( typeof(line1) != 'undefined' ) tooltip1.textContent = line1;
      if ( typeof(line2) != 'undefined' ) tooltip2.textContent = line2;
      if ( typeof(line3) != 'undefined' ) tooltip3.textContent = line3;
      if ( typeof(line4) != 'undefined' ) tooltip4.textContent = line4;
      if ( this.helpTimer > 0 ) {
        window.clearTimeout( this.helpTimer );
        this.helpTimer = 0;
      }
      let time2hide = 2000;
      if ( show ) {
        tooltip.openPopup(statusbaricon, "before_start", 0, 0, false, true, null);
        time2hide = 5000;
      }
      this.helpTimer = window.setTimeout( function(){ tooltip.hidePopup(); }, time2hide );
    }
  },
  
  onTokenChange: function() {
    let searchValue = this.value;
    let start = searchValue.lastIndexOf(' ', this.selectionEnd > 0 ? this.selectionEnd - 1 : 0); // selectionEnd is index of the character after the selection
    let currentString = searchValue.substring(start+1, this.selectionEnd);
    currentString = currentString.replace(/:.*/,'');
    ExpressionSearchLog.log("string:"+currentString);
    ExpressionSearchLog.logObject(ExpressionSearchTokens.mostFit(currentString),'ret',1);
    let help = ExpressionSearchTokens.mostFit(currentString);
    let term = undefined;
    if ( searchValue == '' ) term = ' ';
    ExpressionSearchChrome.showHideHelp(1, help.alias, help.info, help.matchString, term);
  },
  
  onSearchKeyPress: function(event){
    ExpressionSearchChrome.isEnter = 0;
    let searchValue = this.value; // this is aNode/my search text box, not updated with event.char yet
    if ( event && ( ( event.DOM_VK_RETURN && event.keyCode==event.DOM_VK_RETURN ) || ( event.DOM_VK_ENTER && event.keyCode==event.DOM_VK_ENTER ) ) ) {
      ExpressionSearchChrome.isEnter = 1;
      let panel = document.getElementById("qfb-text-search-upsell");
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
          let e = compute_expression(searchValue);
          if (e.kind == 'spec' && e.tok == 'calc') {
            ExpressionSearchChrome.isEnter = 0; // showCalculationResult also will select the result.
            ExpressionSearchChrome.showCalculationResult(e);
          }
        }
      }
    } // end of IsEnter
    ExpressionSearchChrome.hideUpsellPanel(); // hide the panel when key press
    // -- Keypresses for focus transferral
    if ( event && event.DOM_VK_DOWN && ( event.keyCode == event.DOM_VK_DOWN ) && !event.altKey )
      ExpressionSearchChrome.selectFirstMessage(true);
    else if ( ( typeof(searchValue) == 'undefined' || searchValue == '' ) && event && event.DOM_VK_ESCAPE && ( event.keyCode == event.DOM_VK_ESCAPE ) && !event.altKey && !event.ctrlKey )
      ExpressionSearchChrome.selectFirstMessage(); // no select message, but select pane
    else {
      let self = this;
      window.setTimeout( function(){ ExpressionSearchChrome.onTokenChange.apply(self) ;}, 1  ); // defer the call or this.value is still the old value
    }
  },
  
  onSearchBarFocus: function(event) {
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( aNode ) {
      if ( aNode.value == '' ) QuickFilterBarMuxer._showFilterBar(true);
      ExpressionSearchChrome.onTokenChange.apply(aNode);
    }
  },

  initSearchInput: function() {
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( aNode ) {
      aNode.addEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true); // false will be after onComand, too late
      //aNode.addEventListener("input", ExpressionSearchChrome.onTokenChange, true); // input can't get arrow key change
      aNode.addEventListener("click", ExpressionSearchChrome.onTokenChange, true); // to track selectEnd change
      aNode.addEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
      aNode.addEventListener("focus", ExpressionSearchChrome.onSearchBarFocus, true);
    }
  },
  
  // not works well for complex searchTerms. But it's for all folders.
  createQuickFolder: function(searchTerms) {
    const nsMsgFolderFlags = this.Ci.nsMsgFolderFlags;
    var currFolder = gFolderDisplay.displayedFolder;
    var currURI = currFolder.URI;
    var rootFolder = currFolder.rootFolder; // nsIMsgFolder
    var QSFolderName = "ExpressionSearch";
    var uriSearchString = "";
    if (!rootFolder) {
      alert('Expression Search: Cannot determine root folder of search');
      return;
    }
    let virtual_folder_path = this.prefs.getCharPref('virtual_folder_path'); // '' or 'mailbox://nobody@Local%20Folders/Archive'
    let targetFolderParent = rootFolder;
    if ( virtual_folder_path != '' ) targetFolderParent = GetMsgFolderFromUri(virtual_folder_path, true);
    var QSFolderURI = targetFolderParent.URI + "/" + QSFolderName;
    
    if ( !targetFolderParent.containsChildNamed(QSFolderName) || ! this.options.reuse_existing_folder ) {
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
    if (targetFolderParent.containsChildNamed(QSFolderName)) {
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
      MailServices.accounts.saveVirtualFolders();
    } else {
      VirtualFolderHelper.createNewVirtualFolder(QSFolderName, targetFolderParent, uriSearchString, searchTerms, false);
    }

    if (currURI == QSFolderURI) {
      // select another folder to force reload of our virtual folder
      SelectFolder(rootFolder.getFolderWithFlags(nsMsgFolderFlags.Inbox).URI);
    }
    SelectFolder(QSFolderURI);
    //ExpressionSearchCommon.loadTab( {folder: msgFolder, type:'folder'} ); // load in Tab, cause getFilter error
  },

  // select first message, expand first container if closed
  selectFirstMessage: function(needSelect) { // needSelect: false:no foucus change, undefined:focus pan, true: focus to pan and select message
    if ( typeof(gFolderDisplay)!='undefined' && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject && gFolderDisplay.tree.treeBoxObject.view ) {
      let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
      let treeView = treeBox.view; //nsITreeView
      let dbViewWrapper = gFolderDisplay.view; // DBViewWrapper
      let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
      if ( aNode && treeView && dbViewWrapper && treeView.rowCount > 0 ) {
        if ( treeView.isContainer(0) && !treeView.isContainerOpen(0))
          treeView.toggleOpenState(0);
        if ( typeof(needSelect) == 'undefined' || needSelect ) {
          let threadPane = document.getElementById("threadTree");
          // focusing does not actually select the row...
          threadPane.focus();
          if ( needSelect ) {
            // ...so explicitly select the currentIndex if avaliable or the 1st one
            //threadPane.view.selection.select(threadPane.currentIndex);
            var row = treeView.isContainer(0)&&dbViewWrapper.showGroupedBySort ? 1 : 0;
            treeView.selection.select(row);
            treeBox.ensureRowIsVisible(row);
          } // needSelect
        } // undefined or needSelect
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
    if ( !row || !col || typeof(row.value)=='undefined' || typeof(col.value)=='undefined' || row.value < 0 || col.value == null ) return;
    // col.value.id: subjectCol, senderCol, recipientCol (may contains multi recipient, Comma Seprated), tagsCol, sio_inoutaddressCol (ShowInOut)
    let token = "";
    let sCellText = event.currentTarget.view.getCellText(row.value, col.value);
    let msgHdr = gDBView.getMsgHdrAt(row.value);
    switch(col.value.id) {
       case "subjectCol":
         sCellText = ExpressionSearchChrome.RegexpReplaceString( sCellText );
         token = "simple";
         if ( sCellText.indexOf("(") == 0 )
           token = "s";
         let oldValue = "";
         while ( oldValue != sCellText ) {
           oldValue = sCellText;
           // \uFF1A is chinese colon
           [/^\s*\S{2,3}(?::|\uFF1A)\s*(.*)$/, /^\s*\[.+\]:*\s*(.*)$/, /^\s+(.*)$/].forEach( function(element, index, array) {
             sCellText = sCellText.replace(element, '$1');
           });
         }
         break;
       case "senderCol":
         token = "f";
         //break;
       case "recipientCol":
         if ( token == "" ) token = "t";
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
         let addressesFromHdr = GlodaUtils.parseMailAddresses( token=='f' ? msgHdr.mime2DecodedAuthor : msgHdr.mime2DecodedRecipients );
         let addressesFromCell = GlodaUtils.parseMailAddresses(sCellText);
         sCellText = addressesFromHdr.addresses.map( function(address,index) {
           let ret = address;
           if ( typeof(addressesFromHdr.fullAddresses[index]) != 'undefined' && typeof(addressesFromCell.addresses[index]) != 'undefined' ) {
             addressesFromCell.addresses[index] = addressesFromCell.addresses[index].replace(/['"<>]/g,'');
             ExpressionSearchLog.log(addressesFromHdr.fullAddresses[index].toLowerCase() + ":" + addressesFromCell.addresses[index].toLowerCase());
             if ( addressesFromHdr.fullAddresses[index].toLowerCase().indexOf( addressesFromCell.addresses[index].toLowerCase() ) != -1)
               ret = addressesFromCell.addresses[index]; // if display name is part of full address, then use display name
           }
           return ret.replace(/(.*)@.*/, '$1'); // use mail ID only if it's an email address.
         } ).join(' and ');
         if ( addressesFromHdr.count > 1 ) sCellText = "(" + sCellText + ")";
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
    QuickFilterBarMuxer._showFilterBar(true);
    aNode.value = token + ":" + sCellText;
    ExpressionSearchChrome.isEnter = true; // So the email can be selected
    aNode._fireCommand(aNode);
    // Stop even bubbling
    event.preventDefault();
    event.stopPropagation();
  },
  
  firstRunAction: function() {
    let str = this.Cc["@mozilla.org/supports-string;1"].createInstance(this.Ci.nsISupportsString);
    str.data = this.options.current_version; 
    this.prefs.setComplexValue('installed_version', this.Ci.nsISupportsString, str); // must before loadTab
    let anchor = '';
    if ( this.options.installed_version != "0.1" ) anchor = '#version_history'; // this is an update
    let firstRun = Services.vc.compare( this.options.current_version, this.options.installed_version );
    if ( firstRun > 0 ) { // first for this version
      ExpressionSearchCommon.loadTab('expressionsearch.helpfile', anchor);
    }
  },
  
  initAfterLoad: function() {
    window.removeEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
    ExpressionSearchChrome.initSearchInput();
    ExpressionSearchChrome.refreshFilterBar();
    let threadPane = document.getElementById("threadTree");
    if ( threadPane )
      threadPane.addEventListener("click", ExpressionSearchChrome.onClicked, true);
      
    // first get my own version
    ExpressionSearchChrome.options.current_version = "0.0"; // in default.js, it's 0.1, so first installed users also have help loaded
    try {
        // Gecko 2 and later
        ExpressionSearchChrome.Cu.import("resource://gre/modules/AddonManager.jsm");
        // Async call!
        AddonManager.getAddonByID("{03EF8A6E-C972-488f-92FA-98ABC2C9F8B9}", function(addon) {
          ExpressionSearchChrome.options.current_version = addon.version;
          ExpressionSearchChrome.firstRunAction.apply(ExpressionSearchChrome);
      });
    } catch (ex) {
    }
  },

  setFocus: function() {
    let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
    if ( ExpressionSearchChrome.options.move2bar==0 && !QuickFilterBarMuxer.activeFilterer.visible )
      QuickFilterBarMuxer._showFilterBar(true);
    aNode.focus();
  },

};

//onload is too late for me to init
// this is much complex and both works ;-)
//(function() { this.init(); }).apply(ExpressionSearchChrome);
ExpressionSearchChrome.init();
window.addEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
window.addEventListener("unload", ExpressionSearchChrome.unregister, false);
