//////////////////////////////////////////////////
// Silex, live web creation
// http://projects.silexlabs.org/?/silex/
//
// Copyright (c) 2012 Silex Labs
// http://www.silexlabs.org/
//
// Silex is available under the GPL license
// http://www.silexlabs.org/silex/silex-licensing/
//////////////////////////////////////////////////

/**
 * @fileoverview In Silex, each UI of the view package,
 *      has a controller in the UI controller package which listens to its events,
 *      and call the main {silex.controller.Controller} controller's methods
 *      These UI controllers override the
 *      {silex.controller.ControllerBase} UiControllerBase class
 *
 */
goog.provide('silex.controller.ControllerBase');

goog.require('silex.utils.Notification');
goog.require('silex.utils.JQueryPageable');
goog.require('silex.utils.RetroCompat');

/**
 * @constructor
 * base class for all UI controllers of the controller package
 * @param {silex.types.Model} model
 * @param {silex.types.View} view
 */
silex.controller.ControllerBase = function (model, view) {
  // store the model and view
  this.model = model;
  this.view = view;

  // tracker
  this.tracker = silex.service.Tracker.getInstance();
};


/**
 * {silex.service.Tracker} tracker used to pull statistics on the user actions
 * @see     silex.service.Tracker
 */
silex.controller.ControllerBase.prototype.tracker;


/**
 * reference to the {object} view, an object with properties menu, stage...
 */
silex.controller.ControllerBase.prototype.view;


/**
 * reference to the {object} model, an object with properties file, head, body...
 */
silex.controller.ControllerBase.prototype.model;


/**
 * remove an element from the stage
 * @param {element} element    the element to remove
 */
silex.controller.ControllerBase.prototype.removeElement = function(opt_element) {
  // default is selected element
  if(!opt_element) opt_element = this.view.stage.getSelection()[0];
  // remove the element
  this.model.element.removeElement(opt_element);
  // update view
  this.view.propertyTool.redraw();
}


/**
 * create an element and add it to the stage
 * @return {element} the new element
 */
silex.controller.ControllerBase.prototype.addElement = function(type) {
  // create the element and add it to the stage
  var element = this.model.element.createElement(type);
  // only visible on the current page
  var currentPageName = silex.utils.JQueryPageable.getCurrentPageName(this.model.body.bodyElement);
  silex.utils.JQueryPageable.addToPage(element, currentPageName);
  // unless one of its parents is in a page already
  this.checkElementVisibility(element);
  // select the component
  this.model.element.setSelected(element, true);
  // update view
  this.view.propertyTool.redraw();
  return element;
}


/**
 * edit an {element} element
 * take its type into account and open the corresponding editor
 */
silex.controller.ControllerBase.prototype.editElement = function(opt_element) {
  // default is selected element
  if(!opt_element) opt_element = this.view.stage.getSelection()[0];

  switch (this.model.element.getType(opt_element)) {
    case silex.model.Element.TYPE_TEXT:
      this.view.textEditor.openEditor(this.model.Element.getInnerHtml(opt_element));
      break;
    case silex.model.Element.TYPE_HTML:
      this.view.htmlEditor.openEditor(this.model.Element.getInnerHtml(opt_element));
      break;
    case silex.model.Element.TYPE_IMAGE:
      this.view.fileExplorer.openDialog(
          goog.bind(function(url) {
            this.model.element.setImageUrl(opt_element, url);
          }, this),
          ['image/*', 'text/plain'],
          goog.bind(function(error) {
            silex.utils.Notification.notifyError('Error: I did not manage to load the image. <br /><br />' + (error.message || ''));
          }, this)
      );
      this.view.workspace.invalidate();
      break;
  }
};


/**
 * open a page
 */
silex.controller.ControllerBase.prototype.openPage = function(pageName) {
  silex.utils.JQueryPageable.setCurrentPage(this.model.body.bodyElement, pageName);
  // update view
  this.view.pageTool.refresh();
}
/**
 * rename a page
 */
silex.controller.ControllerBase.prototype.renamePage = function(opt_pageName) {
  // default to the current page
  if (!opt_pageName){
    opt_pageName = silex.utils.JQueryPageable.getCurrentPageName(this.model.body.bodyElement);
  }
  this.getUserInputPageName(
    silex.utils.JQueryPageable.getDisplayName(
      this.model.body.bodyElement, opt_pageName),
      goog.bind(function(name, newDisplayName) {
    if (newDisplayName) {
      // update model
      silex.utils.JQueryPageable.renamePage(this.model.body.bodyElement, opt_pageName, name, newDisplayName);
      // open the new page
      this.openPage(name);
    }
  }, this));
};


/**
 * remvove a page
 */
silex.controller.ControllerBase.prototype.removePage = function(opt_pageName) {
  // default to the current page
  if (!opt_pageName){
    opt_pageName = silex.utils.JQueryPageable.getCurrentPage(this.model.body.bodyElement);
  }
  // confirm and delete
  silex.utils.Notification.confirm('I am about to delete the page "' + silex.utils.JQueryPageable.getDisplayName(opt_pageName) + '", are you sure?',
    function(accept) {
    if (accept) {
      // update model
      silex.utils.JQueryPageable.removePage(opt_pageName);
      // update view
      this.view.pageTool.refresh();
      this.view.propertyTool.redraw(); // css class of selected element may have chenged
    }
  });
};


/**
 * input a page name
 */
silex.controller.ControllerBase.prototype.getUserInputPageName = function(defaultName, cbk) {
  silex.utils.Notification.prompt('Enter a name for your page!',
      function(accept, name) {
        if (accept && name && name.length > 0) {
          // keep the full name
          var displayName = name;
          // cleanup the page name
          name = name.replace(/\ /g, '-')
                .replace(/\./g, '-')
                .replace(/'/g, '-')
                .replace(/"/g, '-')
                .toLowerCase();
          // check if a page with this name exists
          var pages = silex.utils.JQueryPageable.getPages();
          var exists = false;
          goog.array.forEach(pages, function(pageName) {
            if (pageName === name)
              exists = true;
          });
          if (exists) {
            silex.utils.JQueryPageable.openPage(name);
          }
          else {
            cbk(name, displayName);
          }
        }
        cbk(null);
      }, defaultName);
};


/**
 * check if the element's parents belong to a page, and if one of them do,
 * remove the element from the other pages
 *
 * if the element is in a container which is visible only on some pages,
 * then the element should be visible everywhere, i.e. in the same pages as its parent
 */
silex.controller.ControllerBase.prototype.checkElementVisibility = function(element) {
  var parentPage = silex.utils.JQueryPageable.getParentPage(element);
  if (parentPage !== null) {
    // get all the pages
    var pages = silex.utils.JQueryPageable.getPagesForElement(this.rootPageable);
    for (idx in pages) {
      // remove the component from the page
      var pageName = pages[idx];
      silex.utils.JQueryPageable.removeFromPage(element, pageName);
    }
    // redraw the tool box in order to reflect the changes
    this.view.propertyTool.redraw();
  }
}


/**
 * create a page
 */
silex.controller.ControllerBase.prototype.createPage = function(successCbk, errorCbk) {
  this.getUserInputPageName('Your new page name', goog.bind(function(name, displayName) {
    if (name) {
      // create the page model
      silex.utils.JQueryPageable.createPage(this.model.body.bodyElement, name, displayName);
      this.openPage(name);
      this.tracker.trackAction('controller-events', 'success', event.type, 0);
      if (successCbk) successCbk();
    }
    else {
      this.tracker.trackAction('controller-events', 'cancel', event.type, 0);
      if (errorCbk) errorCbk();
    }
  }, this));
};


/**
 * view this file in a new window
 */
silex.controller.ControllerBase.prototype.preview = function() {
  if (!this.model.file.getUrl()) {
    silex.utils.Notification.confirm('Save your file before preview?', goog.bind(function(accept) {
      if (accept) {
        this.save(null, goog.bind(function() {
          window.open(this.model.file.getUrl());
        }, this));
      }
    }, this));
  }
  else {
    window.open(this.model.file.getUrl());
  }
};


/**
 * ask the user for a new file title
 */
silex.controller.ControllerBase.prototype.promptTitle = function(){
  silex.utils.Notification.prompt('What is the name of your website?', goog.bind(function(accept, name) {
    if (accept) {
      this.model.head.setTitle(name);
      this.view.menu.redraw();
    }
  }, this), this.model.head.getTitle());
}
/**
 * refresh font list in the text editor, and in the head tag
 */
silex.controller.ControllerBase.prototype.refreshFonts = function(){
  //update loaded font list, as user might have choose a new one
  var neededFonts = this.view.stage.getNeededFonts();
  this.model.head.refreshFontList(neededFonts);
}
/**
 * open a file
 */
silex.controller.ControllerBase.prototype.newFile = function(opt_cbk, opt_errorCbk){
  this.model.file.newFile(goog.bind(function (rawHtml) {
    this.model.file.setHtml(rawHtml);
    this.fileOperationSuccess(null, true);
    // handle retrocompatibility issues
    silex.utils.RetroCompat.process(this.model.body.bodyElement, this.model.head.headElement);
    if (opt_cbk) {
      opt_cbk();
    }
  }, this), opt_errorCbk);
}
/**
 * open a file
 */
silex.controller.ControllerBase.prototype.openFile = function(url, opt_cbk, opt_errorCbk){
  this.model.file.open(url, goog.bind(function(rawHtml) {
    this.model.body.setHtml(rawHtml);
    this.fileOperationSuccess(this.model.head.getTitle() + ' opened.', true)
    if(opt_cbk) opt_cbk();
  }, this),
  goog.bind(function(error) {
    silex.utils.Notification.notifyError('Error: I did not manage to open this file. <br /><br />' + (error.message || ''));
    this.tracker.trackAction('controller-events', 'error', event.type, -1);
    if(opt_errorCbk) opt_errorCbk(error);
  }, this));
}
/**
 * save or save-as
 */
silex.controller.ControllerBase.prototype.save = function(opt_url, opt_cbk, opt_errorCbk){

  if (opt_url){
    this.model.file.save(
      opt_url,
      goog.bind(function() {
        this.fileOperationSuccess('File is saved.', false)
        if (opt_cbk) opt_cbk();
      }, this),
      goog.bind(function(error) {
        silex.utils.Notification.notifyError('Error: I did not manage to save the file. <br /><br />' + (error.message || ''));
        if (opt_errorCbk) opt_errorCbk(error);
        this.tracker.trackAction('controller-events', 'error', event.type, -1);
      }, this));
  }
  else{
    // choose a new name
    this.view.fileExplorer.saveAsDialog(
      goog.bind(function(url) {
        this.model.file.saveAs(
          goog.bind(function() {
            this.fileOperationSuccess('File is saved.', false)
            if (opt_cbk) opt_cbk();
          }, this),
          goog.bind(function(error) {
            silex.utils.Notification.notifyError('Error: I did not manage to save the file. <br /><br />' + (error.message || ''));
            if (opt_errorCbk) opt_errorCbk(error);
            this.tracker.trackAction('controller-events', 'error', event.type, -1);
          }, this));
      }, this),
      ['text/html', 'text/plain']
    );
  }
}

/**
 * publish html page
 */
silex.controller.ControllerBase.prototype.fileOperationSuccess = function(opt_message, opt_updateTools) {

  // update tools
  if (opt_updateTools){
    this.view.pageTool.redraw();
    this.view.propertyTool.redraw();
    this.view.menu.redraw();

    // update fonts
    this.refreshFonts();

    // open default page
    this.view.pageTool.setSelectedIndex(0);
  }
  if(opt_message){
    // notify user
    silex.utils.Notification.notifySuccess(opt_message);
  }
}

/**
 * ask the user for a new file title
 */
silex.controller.ControllerBase.prototype.publish = function(){
  if (!this.model.head.getPublicationPath()) {
    silex.utils.Notification.alert('I do not know where to publish your site. \
      Select a folder in the settings pannel and do "publish" again. \
      <br /><br />Now I will open the publish settings.',
      goog.bind(function() {
        this.view.settingsDialog.openDialog();
        this.view.workspace.invalidate();
      }, this));
  }
  else
  {
    this.model.file.publish(
      goog.bind(function(status) {
      if (status && status.success == false) {
        console.error('Error: I did not manage to publish the file. (1)');
        silex.utils.Notification.notifyError('I did not manage to publish the file. You may want to check the publication settings and your internet connection. <br /><br />Error message: ' + (status.message || status.code || ''));
        this.tracker.trackAction('controller-events', 'error', event.type, -1);
      }
      else {
        silex.utils.Notification.notifySuccess('I am about to publish your site. This may take several minutes.');
        this.tracker.trackAction('controller-events', 'success', event.type, 1);
      }
      }, this),
      goog.bind(function(error) {
        console.error('Error: I did not manage to publish the file. (2)', error);
        silex.utils.Notification.notifyError('I did not manage to publish the file. You may want to check the publication settings and your internet connection. <br /><br />Error message: ' + error);
        this.tracker.trackAction('controller-events', 'error', event.type, -1);
      }, this));
  }
}


