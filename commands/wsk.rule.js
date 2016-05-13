"use strict";

var vscode = require('vscode');
let util = require("./util.js");

var log;
var ow;

function register(_ow, context, _log) {
    ow = _ow;
    log = _log;
    
    var defaultDisposable = vscode.commands.registerCommand('extension.wsk.rule', defaultAction);
    context.subscriptions.push(defaultDisposable);
}


function defaultAction(params) {

    log.show(true);
    log.appendLine("\n$ wsk rule");
    log.appendLine("available commands:");
    log.appendLine("    create              create new rule");
    log.appendLine("    delete              delete rule");
    log.appendLine("    update              update an existing rule");
    log.appendLine("    enable              enable rule");
    log.appendLine("    disable             disable rule");
    log.appendLine("    status              get rule status");
    log.appendLine("    get                 get rule");
    log.appendLine("    list                list all rules");
}

function list() {
    return ow.triggers.list().then(function (rules) {
        util.appendHeading("rules");
        for (var x=0; x<rules.length; x ++){
                util.appendEntry(rules[x]);	
        }
    })
}

module.exports = {
  register: register,
  list:list
};