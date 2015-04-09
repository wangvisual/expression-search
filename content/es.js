// Original by Ken Mixter for GMailUI, which is "GMailUI is completely free to use as you wish."
// Opera Wang, 2010/1/15
// GPL V3 / MPL
"use strict";

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
        ExpressionSearchLog.log("Expression Search: init...", false, true);
        this.importModules();
        this.initPerf();
        this.initFunctionHook();
        this.isInited = new Date().getTime();
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
    this.Cu.import("resource:///modules/MailUtils.js"); // for MailUtils.getFolderForURI
    this.Cu.import("resource://gre/modules/AddonManager.jsm");
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
      ["hide_normal_filer", "act_as_normal_filter", "reuse_existing_folder", "load_virtual_folder_in_tab", "select_msg_on_enter", "move2bar",
       "results_label_size", "showbuttonlabel", "statusbar_info_showtime", "statusbar_info_hidetime", "c2s_enableCtrl", "c2s_enableShift", "c2s_enableCtrlReplace",
       "c2s_enableShiftReplace", "c2s_regexpMatch", "c2s_regexpReplace", "c2s_removeDomainName", "installed_version", "enable_statusbar_info", "enable_verbose_info"].forEach( function(key) {
        ExpressionSearchChrome.observe('', 'nsPref:changed', key); // we fake one
      } );
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
      case "act_as_normal_filter":
      case "reuse_existing_folder":
      case "load_virtual_folder_in_tab":
      case "select_msg_on_enter":
      case "c2s_enableCtrl":
      case "c2s_enableShift":
      case "c2s_enableCtrlReplace":
      case "c2s_enableShiftReplace":
      case "c2s_removeDomainName":
      case "enable_statusbar_info":
      case "enable_verbose_info":
        this.options[data] = this.prefs.getBoolPref(data);
        break;
      case "move2bar": // 0:keep, 1:toolbar, 2:menubar 3: tabbar
      case "showbuttonlabel": // 0:auto 1:force show 2:force hide 3:hide label & button
      case "statusbar_info_showtime":
      case "statusbar_info_hidetime":
      case "results_label_size": // 0: hide when on filter bar and vertical layout , 1: show 2: hide
        this.options[data] = this.prefs.getIntPref(data);
        break;
      case "c2s_regexpMatch":
      case "c2s_regexpReplace":
      case "installed_version":
        this.options[data] = this.prefs.getComplexValue(data,this.Ci.nsISupportsString).data;
      default:
        break;
    }
    if ( data == 'enable_verbose_info' ) ExpressionSearchLog.setVerbose(this.options.enable_verbose_info);
    if ( !this.isInited ) return;
    if ( ['hide_normal_filer', 'move2bar', 'showbuttonlabel', 'enable_verbose_info', "results_label_size"].indexOf(data) >= 0 )
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
      if ( !ExpressionSearchChrome.textBoxNode.value ) return invocation.proceed();
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
    
    // for results label to show correct colour by copy filterActive attribute from quick-filter-bar to qfb-results-label, and set colour in overlay.css
    ExpressionSearchChrome.hookedFunctions.push( ExpressionSearchaop.after( {target: QuickFilterBarMuxer, method: 'reflectFiltererResults'}, function(result) {
      let qfb = document.getElementById("quick-filter-bar");
      let resultsLabel = document.getElementById("qfb-results-label");
      if ( qfb && resultsLabel ) {
        resultsLabel.setAttribute( "filterActive", qfb.getAttribute("filterActive") || '' );
      }
      return result;
    })[0] );
   
  },

  unregister: function() {
    ExpressionSearchLog.info("Expression Search: unload...");
    let me = ExpressionSearchChrome;
    me.prefs.removeObserver("", me);
    let aNode = me.textBoxNode;
    if ( aNode && aNode.removeEventListener ) {
        aNode.removeEventListener("keypress", me.onSearchKeyPress, true);
        //aNode.removeEventListener("input", me.onTokenChange, true);
        aNode.removeEventListener("click", me.onTokenChange, true);
        aNode.removeEventListener("blur", me.onSearchBarBlur, true);
        aNode.removeEventListener("focus", me.onSearchBarFocus, true);
    }
    let threadPane = document.getElementById("threadTree");
    if ( threadPane && threadPane.RemoveEventListener )
      threadPane.RemoveEventListener("contextmenu", me.onContextMenu, true);
    me.hookedFunctions.forEach( function(hooked, index, array) {
      hooked.unweave();
    } );
    window.removeEventListener("unload", me.unregister, false);
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

    // move expression search box along with other buttons to dest position
    if ( this.options.move2bar != this.options.savedPosition ) {
      this.options.savedPosition = this.options.move2bar;
      let dest = 'quick-filter-bar';
      let qfb = document.getElementById(dest);
      if ( this.options.move2bar ) qfb.classList.add('resetHeight'); // hide the qfb bar when move the elements to other places
      else qfb.classList.remove('resetHeight');
      let reference = null;
      if ( this.options.move2bar == 0 )
        reference = document.getElementById("quick-filter-bar-expando");
      else if ( this.options.move2bar == 1 ) {
        dest = 'mail-bar3';
        reference = document.getElementById('qfb-show-filter-bar');
      } else if ( this.options.move2bar == 2 )
        dest = 'mail-toolbar-menubar2';
      else if ( this.options.move2bar == 3 ) {
        dest = 'tabs-toolbar';
        reference = document.getElementById('tabbar-toolbar');
      }
      let toolbar = document.getElementById(dest);
      let needMove = document.getElementById(ExpressionSearchChrome.needMoveId);
      toolbar.insertBefore(needMove.parentNode.removeChild(needMove), reference);
    }

    let spacer = document.getElementById('qfb-filter-bar-spacer');
    if ( spacer ) {
      spacer.setAttribute('minwidth', 0);
      if ( this.options.move2bar == 0 ) {
        spacer.setAttribute('flex', '2000');
        spacer.style.flex = '2000 1';
      } else {
        spacer.removeAttribute('flex');
        spacer.style.flex = '1 2000 auto';
      }
    }
    
    let resultsLabel = document.getElementById("qfb-results-label");
    if ( resultsLabel ) {
      if ( typeof(resultsLabel._saved_minWidth) == 'undefined' ) resultsLabel._saved_minWidth = resultsLabel.getAttribute('minwidth') || 1;
      let layout = Services.prefs.getIntPref("mail.pane_config.dynamic"); 
      let minWidth = ( this.options.results_label_size == 2 || ( this.options.results_label_size == 0 &&  this.options.move2bar == 0 && layout == kVerticalMailLayout ) ) ? 0 : resultsLabel._saved_minWidth;
      resultsLabel.setAttribute('minwidth', minWidth);
      if ( minWidth == 0 ) delete resultsLabel.style.width;
      if ( spacer ) {
        if ( minWidth == 0 ) spacer.style.width = "1px";
        else spacer.style.width = "15px";
      }
    }

    let collapsible = document.getElementById('quick-filter-bar-collapsible-buttons');
    if ( collapsible && collapsible.classList ) {
      collapsible.classList.remove("hidelabel");
      collapsible.classList.remove("showlabel");
      collapsible.classList.remove("hideall");
      if ( spacer ) spacer.classList.remove("hideall");
      if ( this.options.showbuttonlabel == 1 ) {
        collapsible.classList.add("showlabel");
      } else if ( this.options.showbuttonlabel == 2 ) {
        collapsible.classList.add("hidelabel");
      } else if  ( this.options.showbuttonlabel == 3 ) {
        collapsible.classList.add("hideall");
        if ( spacer ) spacer.classList.add("hideall");
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
    
    let menu = document.getElementById('expression-search-context-menu');
    if ( menu ) {
      for (let i = 0; i < menu.childNodes.length; i++ ) {
        let menuitem = menu.childNodes[i];
        menuitem.style.display = ( this.options['enable_verbose_info'] ) ? "" : "none";
        if ( menuitem.tagName == "menuseparator" ) break;
      };
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
    let statusbaricon = document.getElementById("expression-search-status-bar");
    if ( tooltip && tooltip1 && tooltip2 && tooltip3 && tooltip4 && statusbaricon ) {
      if ( typeof(line1) != 'undefined' ) tooltip1.textContent = line1;
      if ( typeof(line2) != 'undefined' ) tooltip2.textContent = line2;
      if ( typeof(line3) != 'undefined' ) tooltip3.textContent = line3;
      if ( typeof(line4) != 'undefined' ) tooltip4.textContent = line4;
      if ( !this.options.enable_statusbar_info ) return;
      if ( this.helpTimer > 0 ) {
        window.clearTimeout( this.helpTimer );
        this.helpTimer = 0;
      }
      let time2hide = this.options['statusbar_info_hidetime'] * 1000;
      if ( show ) {
        tooltip.openPopup(statusbaricon, "before_start", 0, 0, false, true, null);
        time2hide = this.options['statusbar_info_showtime'] * 1000;
        //if ( this.isFocus ) time2hide *= 2;
      }
      this.helpTimer = window.setTimeout( function(){ tooltip.hidePopup(); }, time2hide );
    }
  },
  
  onTokenChange: function() {
    let searchValue = this.value;
    let start = searchValue.lastIndexOf(' ', this.selectionEnd > 0 ? this.selectionEnd - 1 : 0); // selectionEnd is index of the character after the selection
    //let currentString = searchValue.substring(start+1, this.selectionEnd).replace(/:.*/,'');
    let currentString = searchValue.substring(start+1).replace(/[ :].*/,'');
    let help = ExpressionSearchTokens.mostFit(currentString);
    let term = undefined;
    if ( searchValue == '' ) term = ' ';
    ExpressionSearchChrome.showHideHelp(1, help.alias, help.info, help.matchString, term);
  },
  
  delayedOnSearchKeyPress: function(event) {
    let me = ExpressionSearchChrome;
    me.isEnter = 0;
    let searchValue = this.value; // this is aNode/my search text box, updated with event.char
    if ( event && ( ( event.DOM_VK_RETURN && event.keyCode==event.DOM_VK_RETURN ) || ( event.DOM_VK_ENTER && event.keyCode==event.DOM_VK_ENTER ) ) ) {
      me.isEnter = 1;
      let panel = document.getElementById("qfb-text-search-upsell");
      if ( typeof(searchValue) != 'undefined' && searchValue != '' ) {
        if ( event.ctrlKey || event.metaKey ) { // create quick search folder
          ExperssionSearchFilter.latchQSFolderReq = me;
          this._fireCommand(this);
        } else if ( GlodaIndexer.enabled && ( panel.state=="open" || event.shiftKey || searchValue.toLowerCase().indexOf('g:') == 0 ) ) { // gloda
          searchValue = ExperssionSearchFilter.expression2gloda(searchValue);
          if ( searchValue != '' ) {
            //this._fireCommand(this); // just for selection, but no use as TB will unselect it
            let tabmail = document.getElementById("tabmail");
            tabmail.openTab("glodaFacet", {
              searcher: new GlodaMsgSearcher(null, searchValue)
            });
          }
        } else {
          let e = ExpressionSearchComputeExpression(searchValue);
          if (e.kind == 'spec' && e.tok == 'calc') {
            me.isEnter = 0; // showCalculationResult also will select the result.
            me.showCalculationResult(e);
          }
        }
      }
    } // end of IsEnter
    me.hideUpsellPanel(); // hide the panel when key press
    // -- Keypresses for focus transferral
    if ( event && event.DOM_VK_DOWN && ( event.keyCode == event.DOM_VK_DOWN ) && !event.altKey )
      me.selectFirstMessage(true);
    else if ( ( typeof(searchValue) == 'undefined' || searchValue == '' ) && event && event.DOM_VK_ESCAPE && ( event.keyCode == event.DOM_VK_ESCAPE ) && !event.altKey && !event.ctrlKey )
      me.selectFirstMessage(); // no select message, but select pane
    //else if (  event.altKey && ( event.ctrlKey || event.metaKey ) && event.keyCode == event.DOM_VK_LEFT ) // Ctrl + <-- not works when focus in textbox
    //  me.back2OriginalFolder();
    else me.onTokenChange.apply(this);
  },
  
  onSearchKeyPress: function(event){
    let self = this;
    // defer the call or this.value is still the old value, not updated with event.char yet
    window.setTimeout( function(){ ExpressionSearchChrome.delayedOnSearchKeyPress.call(self,event); }, 0);
  },
  
  onSearchBarBlur: function(event) {
    ExpressionSearchChrome.hideUpsellPanel();
    ExpressionSearchChrome.isFocus = false;
    ExpressionSearchChrome.showHideHelp(false);
  },
  
  onSearchBarFocus: function(event) {
    let aNode = ExpressionSearchChrome.textBoxNode;
    if ( aNode ) {
      if ( aNode.value == '' ) QuickFilterBarMuxer._showFilterBar(true);
      ExpressionSearchChrome.isFocus = true;
      ExpressionSearchChrome.onTokenChange.apply(aNode);
    }
  },

  initSearchInput: function() {
    let aNode = this.textBoxNode = document.getElementById(this.textBoxDomId);
    if ( aNode ) {
      aNode.addEventListener("keypress", this.onSearchKeyPress, true); // false will be after onComand, too late
      //aNode.addEventListener("input", this.onTokenChange, true); // input can't get arrow key change but can get update when click2search
      aNode.addEventListener("click", this.onTokenChange, true); // to track selectEnd change
      aNode.addEventListener("blur", this.onSearchBarBlur, true);
      aNode.addEventListener("focus", this.onSearchBarFocus, true);
    } else {
      ExpressionSearchLog.log("Expression Search: Can't find my textbox", "Error");
    }
  },
  
  back2OriginalFolder: function() {
    try {
      let me = ExpressionSearchChrome;
      if ( typeof(me.originalURI) == 'undefined' ) {
        me.originalURI = gFolderDisplay.displayedFolder.rootFolder.URI;
      }
      SelectFolder(me.originalURI);
    } catch (err) {
    }
  },
  
  // not works well for complex searchTerms. But it's for all folders.
  createQuickFolder: function(searchTerms) {
    const nsMsgFolderFlags = this.Ci.nsMsgFolderFlags;
    var currFolder = gFolderDisplay.displayedFolder;
    this.originalURI = currFolder.URI;
    var rootFolder = currFolder.rootFolder; // nsIMsgFolder
    var QSFolderName = "ExpressionSearch";
    var uriSearchString = "";
    if (!rootFolder) {
      alert('Expression Search: Cannot determine root folder of search');
      return;
    }
    let virtual_folder_path = this.prefs.getCharPref('virtual_folder_path'); // '' or 'mailbox://nobody@Local%20Folders/Archive'
    let targetFolderParent = rootFolder;
    if ( virtual_folder_path != '' ) targetFolderParent = MailUtils.getFolderForURI(virtual_folder_path, true);
    var QSFolderURI = targetFolderParent.URI + "/" + QSFolderName;
    
    if ( !targetFolderParent.containsChildNamed(QSFolderName) || ! this.options.reuse_existing_folder ) {
      let allDescendants;
      if ( typeof(rootFolder.descendants) != 'undefined' ) { // bug 436089
        allDescendants = rootFolder.descendants;
      } else { // < TB 21
        allDescendants = this.Cc["@mozilla.org/supports-array;1"].createInstance(this.Ci.nsISupportsArray);
        rootFolder.ListDescendents(allDescendants);
      }
      for (let folder in fixIterator(allDescendants, this.Ci.nsIMsgFolder)) {
        // only add non-virtual non-news folders
        if ( !folder.isSpecialFolder(nsMsgFolderFlags.Newsgroup,false) && !folder.isSpecialFolder(nsMsgFolderFlags.Virtual,false) ) {
          if (uriSearchString != "") {
            uriSearchString += "|";
          }
          uriSearchString += folder.URI;
        }
      }
    }

    if ( this.options.load_virtual_folder_in_tab ) {
      // select folders to clear the search box
      SelectFolder(QSFolderURI);
      SelectFolder(this.originalURI);
      // if loadTab later, will get 'Error: There is no active filterer but we want one.'
      ExpressionSearchCommon.loadTab( {folder:rootFolder, type:'folder'} );
    }
    //Check if folder exists already
    if (targetFolderParent.containsChildNamed(QSFolderName)) {
      // modify existing folder
      var msgFolder = MailUtils.getFolderForURI(QSFolderURI);
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

    if (this.originalURI == QSFolderURI) {
      // select another folder to force reload of our virtual folder
      SelectFolder(rootFolder.getFolderWithFlags(nsMsgFolderFlags.Inbox).URI);
    }
    SelectFolder(QSFolderURI);
  },

  // select first message, expand first container if closed
  selectFirstMessage: function(needSelect) { // needSelect: false:no foucus change, undefined:focus pan, true: focus to pan and select message
    if ( typeof(gFolderDisplay)!='undefined' && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject && gFolderDisplay.tree.treeBoxObject.view ) {
      let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
      let treeView = treeBox.view; //nsITreeView
      let dbViewWrapper = gFolderDisplay.view; // DBViewWrapper
      if ( ExpressionSearchChrome.textBoxNode && treeView && dbViewWrapper && treeView.rowCount > 0 ) {
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
    }
    ExpressionSearchLog.log('Expression Search: unexpected expression tree when calculating result',1);
    return { kind: 'error', tok: 'internal' };
  },

  showCalculationResult: function(e) {
    e = e.left; // skip the calc: specifier
    // compute the result of this calculation
    var r = this.calculateResult(e);
    // print the expression,
    var lhs = ExpressionSearchExprToStringInfix(e);
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
	try {
      let regexp = new RegExp(ExpressionSearchChrome.options.c2s_regexpMatch, "gi"); // with g modifier, r_match[0] is the first match intead of whole match string
      let r_match = str.match(regexp);
      if ( !r_match ) return str;
      let res = r_match.map( function(match) {
        return match.replace(regexp, ExpressionSearchChrome.options.c2s_regexpReplace);
      });
      let out = res.join(" or ");
      if ( res.length > 1)
        out = "(" + out + ")";
      return out;
    } catch (err) {
      ExpressionSearchLog.log("Expression Search Caught Exception " + err.name + ":" + err.message + " with regex '" + ExpressionSearchChrome.options.c2s_regexpMatch + "'", 1);
      return str;
    }
  },

  onContextMenu: function(event) {
    let me = ExpressionSearchChrome;
    if ( !event.currentTarget || !event.currentTarget.treeBoxObject || !event.currentTarget.view ) return;
    let aNode = ExpressionSearchChrome.textBoxNode;
    if ( !aNode ) return;
    if ( ! me.CheckClickSearchEvent(event) ) return;
    var row = {}; var col = {}; var childElt = {};
    event.currentTarget.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, childElt);
    if ( !row || !col || typeof(row.value)=='undefined' || typeof(col.value)=='undefined' || row.value < 0 || col.value == null ) return;
    // col.value.id: subjectCol, senderCol, recipientCol (may contains multi recipient, Comma Seprated), tagsCol, sio_inoutaddressCol (ShowInOut)
    let token = "";
    let sCellText = event.currentTarget.view.getCellText(row.value, col.value);
    let msgHdr = gDBView.getMsgHdrAt(row.value);
    switch(col.value.id) {
       case "subjectCol":
         if ( ( me.options.c2s_enableCtrlReplace && event.ctrlKey ) || ( me.options.c2s_enableShiftReplace && event.shiftKey ) ) {
           sCellText = me.RegexpReplaceString( sCellText );
         }
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
       case "correspondentCol": // https://bugzilla.mozilla.org/show_bug.cgi?id=36489
         if ( token == "" && gFolderDisplay && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject ) { // not recipientCol
           let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
           let treeView = treeBox.view;
           let properties = treeView.getCellProperties(row.value, col.value).split(/ +/); // ['incoming', 'imap', 'read', 'replied', 'offline']
           token = ( properties.indexOf("in") >= 0 || properties.indexOf("incoming") >= 0 ) ? "f" : "t";
         }
         let addressesFromHdr = GlodaUtils.parseMailAddresses( token=='f' ? msgHdr.mime2DecodedAuthor : msgHdr.mime2DecodedRecipients );
         let addressesFromCell = GlodaUtils.parseMailAddresses(sCellText);
         sCellText = addressesFromHdr.addresses.map( function(address,index) {
           let ret = address;
           if ( addressesFromHdr.fullAddresses[index] && addressesFromCell.names[index] ) {
             addressesFromCell.names[index] = addressesFromCell.names[index].replace(/['"<>]/g,'');
             if ( addressesFromHdr.fullAddresses[index].toLowerCase().indexOf( addressesFromCell.names[index].toLowerCase() ) != -1)
               ret = addressesFromCell.names[index]; // if display name is part of full address, then use display name
           }
           if ( !me.options.c2s_removeDomainName ) return ret;
           return ret.replace(/(.*)@.*/, '$1'); // use mail ID only if it's an email address and c2s_removeDomainName.
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
    aNode.selectionEnd = aNode.selectionStart = 1;
    me.onTokenChange.apply(aNode);
    me.isEnter = true; // So the email can be selected
    // Stop event bubbling
    event.preventDefault();
    event.stopPropagation();
    aNode._fireCommand(aNode);
    return;
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
    let me = ExpressionSearchChrome;
    window.removeEventListener("load", me.initAfterLoad, false);
    me.initSearchInput.apply(me);
    me.refreshFilterBar();
    let threadPane = document.getElementById("threadTree");
    if ( threadPane ) {
      // On Mac, contextmenu is fired before onclick, thus even break onclick  still has context menu
      threadPane.addEventListener("contextmenu", me.onContextMenu, true);
    }
    // Fix tooltip background color issue on Ubuntu
    let tooltip = document.getElementById("expression-search-tooltip");
    if ( tooltip && tooltip.classList ) {
      let color = window.getComputedStyle(tooltip, null).getPropertyValue("background-color"); // string: rgb(255, 255, 225)
      if ( color == 'transparent' ) tooltip.classList.add("forceInfo");
    }

    // first get my own version
    me.options.current_version = "0.0"; // in default.js, it's 0.1, so first installed users also have help loaded
    try {
        AddonManager.getAddonByID("{03EF8A6E-C972-488f-92FA-98ABC2C9F8B9}", function(addon) {
          me.options.current_version = addon.version;
          me.firstRunAction.apply(me);
      });
    } catch (ex) {
    }
  },

  setFocus: function() {
    if ( ExpressionSearchChrome.options.move2bar==0 && !QuickFilterBarMuxer.activeFilterer.visible )
      QuickFilterBarMuxer._showFilterBar(true);
    ExpressionSearchChrome.textBoxNode.focus();
  },

};

//onload is too late for me to init
// this is much complex and both works ;-)
//(function() { this.init(); }).apply(ExpressionSearchChrome);
ExpressionSearchChrome.init();
window.addEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
window.addEventListener("unload", ExpressionSearchChrome.unregister, false);
