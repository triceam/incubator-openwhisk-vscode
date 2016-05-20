"use strict";

var vscode = require('vscode');
let util = require("./util.js");
let fs = require('fs');

var importDirectory = '/wsk-import/';

var log;
var ow;
var actions = [];
var props;

var sequenceComplete = {
                description:"",
                detail:"Sequence Complete - select this option to complete the sequence.  No additional action will be added to the sequence.",
                label:"-- No Action --",
            }//"--- - Sequence Complete ---";

function register(_ow, context, _log, _props) {
    ow = _ow;
    log = _log;
    props = _props;
    
    var defaultDisposable = vscode.commands.registerCommand('extension.wsk.action', defaultAction);
    var listDisposable = vscode.commands.registerCommand('extension.wsk.action.list', listAction);
    var invokeDisposable = vscode.commands.registerCommand('extension.wsk.action.invoke', invokeAction);
    var createDisposable = vscode.commands.registerCommand('extension.wsk.action.create', createAction);
    var updateDisposable = vscode.commands.registerCommand('extension.wsk.action.update', updateAction);
    var deleteDisposable = vscode.commands.registerCommand('extension.wsk.action.delete', deleteAction);
    var getDisposable = vscode.commands.registerCommand('extension.wsk.action.get', getAction);
    var initDisposable = vscode.commands.registerCommand('extension.wsk.action.init', initAction);
    var restDisposable = vscode.commands.registerCommand('extension.wsk.action.rest', restAction);
    var createSequenceDisposable = vscode.commands.registerCommand('extension.wsk.action.sequence.create', createSequenceAction);
    
	context.subscriptions.push(defaultDisposable, listDisposable, invokeDisposable, createDisposable, updateDisposable, deleteDisposable, getDisposable, initDisposable, createSequenceDisposable, restDisposable);
}

function defaultAction(params) {
        
    log.show(true);
    log.appendLine("\n$ wsk action");
    log.appendLine("available commands:");
    log.appendLine("     init                create new action boilerplate file");
    log.appendLine("     create              create new action");
    log.appendLine("     sequence            create a new sequence of actions");
    log.appendLine("     update              update an existing action");
    log.appendLine("     invoke              invoke action");
    log.appendLine("     get                 get action");
    log.appendLine("     delete              delete action");
    log.appendLine("     list                list all actions");
    log.appendLine("     rest                display CURL rest invocation parameters");
}

function listAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    log.show(true);
    log.appendLine("\n$ wsk action list");
    list();
}

function list() {
    return getList().then(function (actions) {
        util.appendHeading("actions");
        for (var x=0; x<actions.length; x ++){
                util.appendEntry(actions[x]);	
        }
    }).catch(function(error) {
        util.printOpenWhiskError(error);
    });
}

function getList() {
    return new Promise(function (fulfill, reject){
        return ow.actions.list().then(function (_actions) {
            actions = _actions;
            fulfill(actions);
        }).catch(function(error) {
            log.appendLine(error.toString())
        });
    });
}

function getListAsStringArray() {
    return getList().then(function (actions) {
        var result = [];
        for (var x=0; x<actions.length; x ++){
            var actionName = util.formatQualifiedName(actions[x]);
            result.push(actionName)	
        }
        return result;
    })
}

function getListAsStringArrayForSequenceDialog(firstCall) {
    return getListAsStringArray().then(function (actions) {
        if (firstCall !== true ) {
            actions.unshift(sequenceComplete)
        }
        return actions;
    })
}

function invokeAction(params) {
    
    if (!props.validate()){
        return;
    }
      
    vscode.window.showQuickPick( getListAsStringArray(), {placeHolder:"Select an action."}).then( function (action) {
        
        if (action == undefined) {
            return;
        }
        
        var actionString = action.toString();
        var startIndex = actionString.indexOf("/");
        var namespace = actionString.substring(0, startIndex);
        var actionToInvoke = actionString.substring(startIndex+1);
        
        vscode.window.showInputBox({
            placeHolder:"Enter parameters list (-p key value) or leave blank for no parameters:",
            value:props.get(actionToInvoke)
        }).then(function (parametersString) {
            
            var pString = ""
            if (parametersString != undefined) {
                pString = parametersString
            }
            
            props.set(actionToInvoke, pString, true);
            
            log.show(true);
            log.appendLine("\n$ wsk action invoke " + actionToInvoke + " " + pString);
            
            var activityInterval = setInterval(function() {
                log.append(".");
            },300);
            
            var startTime = new Date().getTime();
            var invocationParams = {
                actionName: actionToInvoke,
                blocking:true,
                namespace: namespace
            }
            
            if (pString.length>0) {
                invocationParams.params = parseParametersString(pString);
            }
            ow.actions.invoke(invocationParams)
            .then(function(result) {
                var totalTime = startTime - (new Date().getTime());
                clearInterval(activityInterval);
                log.appendLine("\n"+JSON.stringify(result.response, null, 4));
                log.appendLine(">> completed in " + (-totalTime) + "ms");
            })
            .catch(function(error) {
                clearInterval(activityInterval);
                util.printOpenWhiskError(error);
            });
        }); 
    });
}

function parseParametersString(parameterString) {
    var params = {};
    
    var tokens = parameterString.split("-p ");
    
    for (var x=0; x<tokens.length; x++) {
        var token = tokens[x]
        var firstSpace = token.indexOf(" ");
        if (token.length >0 && firstSpace >= 0) {
            var key = token.substring(0, firstSpace).trim();
            var value = token.substring(firstSpace+1).trim();
            params[key] = value;
        }
    }
    
    console.log(params)
    
    return params;
}



function createAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    if (vscode.window.activeTextEditor == undefined || vscode.window.activeTextEditor.document == undefined) {
        vscode.window.showWarningMessage('Must have a document open for editing.  The currently focused document will be used to create the OpenWhisk action.');
        return;
    }
    
    vscode.window.showInputBox({placeHolder:"Enter a name for your action:"})
    .then(function(action){
        
        if (action == undefined) {
            return;
        }
        
        log.show(true);
        log.appendLine("\n$ wsk action create " + action);
    
        log.appendLine("Creating a new action using the currently open document: " + vscode.window.activeTextEditor.document.uri);
        
        var options = {
            actionName: action, 
            action: vscode.window.activeTextEditor.document.getText()
        };
        
        var swiftExt = ".swift";
        var lastIndex = vscode.window.activeTextEditor.document.uri.fsPath.lastIndexOf(swiftExt);
        if (lastIndex == vscode.window.activeTextEditor.document.uri.fsPath.length - swiftExt.length) {
            //it's a swift file, handle it differently
            options.action = { exec: { kind: 'swift:3', code: options.action }}
        }
        
        ow.actions.create(options)
        .then(function(result) {
            log.appendLine("OpenWhisk action created: " + util.formatQualifiedName(result));
            vscode.window.showInformationMessage("OpenWhisk action created: " + util.formatQualifiedName(result));
        })
        .catch(function(error) {
            util.printOpenWhiskError(error);
        });
    });
    
}

function updateAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    if (vscode.window.activeTextEditor == undefined || vscode.window.activeTextEditor.document == undefined) {
        vscode.window.showWarningMessage('Must have a document open for editing.  The currently focused document will be used to create the OpenWhisk action.');
        return;
    }
    
    var YES = "Yes";
    var NO = "No";
    
    
    vscode.window.showQuickPick(getListAsStringArray(), {placeHolder:"Select an action to update:"})
    .then(function(action){
        
        vscode.window.showWarningMessage("Are you sure you want to overwrite " + action, YES, NO)
        .then( function(selection) {
            if (selection === YES) {
                
                if (action == undefined) {
                    return;
                }
                
                var actionString = action.toString();
                var startIndex = actionString.indexOf("/");
                var namespace = actionString.substring(0, startIndex);
                var actionToUpdate = actionString.substring(startIndex+1);
                
                log.show(true);
                log.appendLine("\n$ wsk action update " + actionToUpdate);
            
                log.appendLine("Creating a new action using the currently open document: " + vscode.window.activeTextEditor.document.uri);
                
                var options = {
                    actionName: actionToUpdate, 
                    action: vscode.window.activeTextEditor.document.getText()
                };
                
                var swiftExt = ".swift";
                var lastIndex = vscode.window.activeTextEditor.document.uri.fsPath.lastIndexOf(swiftExt);
                if (lastIndex == vscode.window.activeTextEditor.document.uri.fsPath.length - swiftExt.length) {
                    //it's a swift file, handle it differently
                    options.action = { exec: { kind: 'swift:3', code: options.action }}
                }
                
                ow.actions.update(options)
                .then(function(result) {
                    log.appendLine("OpenWhisk action updated: " + util.formatQualifiedName(result));
                    vscode.window.showInformationMessage("OpenWhisk action updated: " + util.formatQualifiedName(result));
                })
                .catch(function(error) {
                    util.printOpenWhiskError(error);
                });
            }
        });
    });
}

function createSequenceAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    vscode.window.showInputBox({placeHolder:"Enter a name for your action:"})
    .then(function(action){
        
        if (action == undefined) {
            return;
        }
        
        //first get the pipe action, so we can create the sequence action
         ow.actions.get({
            actionName: 'system/pipe',
            blocking:true,
            namespace: 'whisk.system'
        }).then(function(result) {
           
            console.log(result); 
            var pipeCode = result.exec.code;
            
            log.show(true);
            log.appendLine("\n$ wsk action create " + action + " --sequence");
            
            var sequenceActions = [];
            
            var selectSequenceActions = function(firstCall) {
                
                vscode.window.showQuickPick(getListAsStringArrayForSequenceDialog(firstCall), {placeHolder:`Select action #${(sequenceActions.length+1)} for the sequence.`})
                .then(function(selectedActionStep){
                    
                    if (selectedActionStep == undefined) {
                        log.appendLine("cancelled by user ESC");
                        return;
                    }
                    else if (selectedActionStep != sequenceComplete) {
                        
                        sequenceActions.push("/"+selectedActionStep);
                        selectSequenceActions(false);
                    }
                    else {
                        //sequence complete
                        if (sequenceActions.length > 0) {
                            
                            var options = {
                                actionName: action,
                                action: { exec: { kind: 'nodejs', code: pipeCode },
                                parameters:[{
                                        "key": "_actions",
                                        "value": sequenceActions
                                    }] 
                                }
                            };
                            
                            ow.actions.create(options)
                            .then(function(result) {
                                var message = "OpenWhisk sequence created: " + util.formatQualifiedName(result);
                                log.appendLine(message);
                                vscode.window.showInformationMessage(message);
                            })
                            .catch(function(error) {
                                util.printOpenWhiskError(error);
                            });
                        }
                    }
                });
            }
            
            selectSequenceActions(true);
            
            
            
        });
    });
}

function deleteAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    vscode.window.showQuickPick(getListAsStringArray(), {placeHolder:"Select an action to delete:"})
    .then(function(action){
        
        if (action == undefined) {
            return;
        }
        
        var actionString = action.toString();
        var startIndex = actionString.indexOf("/");
        var namespace = actionString.substring(0, startIndex);
        var actionToDelete = actionString.substring(startIndex+1);
        
        log.show(true);
        log.appendLine("\n$ wsk action update " + actionToDelete);
    
        var options = {
            actionName: actionToDelete
        };
        
        var YES = "Yes";
        var NO = "No";
        
        vscode.window.showWarningMessage("Are you sure you want to delete " + actionToDelete, YES, NO)
        .then( function(selection) {
            if (selection === YES) {
                ow.actions.delete(options)
                .then(function(result) {
                    console.log(result);
                    log.appendLine("OpenWhisk action deleted: " + util.formatQualifiedName(result));
                    vscode.window.showInformationMessage("OpenWhisk action deleted: " + util.formatQualifiedName(result));
                })
                .catch(function(error) {
                    util.printOpenWhiskError(error);
                });
            }
        });
    });
}

function getAction(params) {
    
    if (!props.validate()){
        return;
    }
       
    if (vscode.workspace.rootPath == undefined) {
        log.appendLine("You must specify a project folder before you can import actions from OpenWhisk.  Please use the 'File' menu, select 'Open', then select a folder for your project.");
        return;
    }
    
    vscode.window.showQuickPick( getListAsStringArray(), {placeHolder:"Select an action to retrieve:"}).then( function (action) {
        
        if (action == undefined) {
            return;
        }
        
        var actionString = action.toString();
        var startIndex = actionString.indexOf("/");
        var namespace = actionString.substring(0, startIndex);
        var actionToGet = actionString.substring(startIndex+1);
        
        log.show(true);
        log.appendLine("\n$ wsk action get " + actionToGet);
        
        var activityInterval = setInterval(function() {
            log.append(".");
        },300);
        
        var startTime = new Date().getTime();
        ow.actions.get({
            actionName: actionToGet,
            blocking:true,
            namespace: namespace
        }).then(function(result) {
            var totalTime = startTime - (new Date().getTime());;
            clearInterval(activityInterval);
            log.appendLine(">> completed in " + (-totalTime) + "ms")
            
            if (isSequence(result)) {
                var message = actionToGet + " is a sequence.  It cannot be edited directly, and has not be written to a file.";
                log.appendLine(message)
                vscode.window.showWarningMessage(message);
                log.appendLine("You can edit these individual sequence actions: ");
                for (var x=0; x < result.parameters.length; x ++){
                    var param =  result.parameters[x];
                    if (param.key == "_actions") {
                        for (var y=0; y < param.value.length; y ++){
                            log.appendLine("  >  " + param.value[y])
                        }
                    }
                }
            }
            else {
                log.appendLine(JSON.stringify(result,  null, 4))
                //todo: check if file exists before writing
                //todo: make sure user has selected a directory to import into
                
                var buffer = new Buffer(result.exec.code);
                var fileName = result.name;
                if (result.exec.kind.toString().search("swift") >= 0) {
                    fileName += ".swift"
                } else {
                    fileName += ".js"
                }
                var path = vscode.workspace.rootPath + importDirectory
                
                if (!fs.existsSync(path)){
                    fs.mkdirSync(path);
                }

                path += fileName;

                fs.open(path, 'w', function(err, fd) {
                    if (err) {
                        throw 'error opening file: ' + err;
                    }

                    fs.write(fd, buffer, 0, buffer.length, null, function(err) {
                        if (err) throw 'error writing file: ' + err;
                        fs.close(fd, function() {
                            //console.log('file written');
                            
                            vscode.workspace.openTextDocument(path)
                            .then(function(document) {
                                vscode.window.showTextDocument(document);
                                vscode.window.showInformationMessage('Successfully imported ' + importDirectory + fileName);
                                log.appendLine('Successfully imported file to ' + path);
                            });
                            
                        })
                    });
                });
            }
        })
        .catch(function(error) {
            util.printOpenWhiskError(error);
        });
    });
}

function isSequence(result) {
    if (result.parameters) {
        for (var x=0; x < result.parameters.length; x ++){
            var param =  result.parameters[x];
            if (param.key == "_actions") {
                return true;
            }
        }
    }
    return false;
}

function initAction(params) {
       
    var NODE = "Node.js",
        SWIFT = "Swift";
    vscode.window.showQuickPick( [NODE, SWIFT], {placeHolder:"Select the type of action:"}).then( function (action) {
        
        if (action == undefined) {
            return;
        }
        
        var template = "";
        if (action == NODE) {
            template = nodeTemplate;
        } else {
            template = swiftTemplate;
        }
        
        log.show(true);
        log.appendLine("\n$ wsk action init:" + action);
        
        //todo: make it look for unique names or prompt for name
            
            var buffer = new Buffer(template);
            var fileName = "newAction";
            if (action == NODE) {
                fileName += ".js"
            } else {
                fileName += ".swift"
            }
            
            var path = vscode.workspace.rootPath + importDirectory
            
            if (!fs.existsSync(path)){
                fs.mkdirSync(path);
            }

            path += fileName;

            fs.open(path, 'w', function(err, fd) {
                if (err) {
                    throw 'error opening file: ' + err;
                }

                fs.write(fd, buffer, 0, buffer.length, null, function(err) {
                    if (err) throw 'error writing file: ' + err;
                    fs.close(fd, function() {
                        //console.log('file written');
                        
                        vscode.workspace.openTextDocument(path)
                        .then(function(document) {
                            //console.log(document)
                            vscode.window.showTextDocument(document);
                            log.appendLine('Created new action using ' + action + ' template');
                        });
                        
                    })
                });
            });
    });
}

function restAction(params) {
    
    if (!props.validate()){
        return;
    }
    
    vscode.window.showQuickPick( getListAsStringArray(), {placeHolder:"Select an action to retrieve:"}).then( function (action) {
        
        if (action == undefined) {
            return;
        }
        
        var actionString = action.toString();
        var startIndex = actionString.indexOf("/");
        var namespace = actionString.substring(0, startIndex);
        var actionToGet = actionString.substring(startIndex+1);
        
        log.show(true);
        log.appendLine("\n$ wsk action get " + actionToGet);
        
        var activityInterval = setInterval(function() {
            log.append(".");
        },300);
        
        
        var apiRoot = ow.actions.options.api
        var startTime = new Date().getTime();
        ow.actions.get({
            actionName: actionToGet,
            blocking:true,
            namespace: namespace
        }).then(function(result) {
            var totalTime = startTime - (new Date().getTime());;
            clearInterval(activityInterval);

            var hash = new Buffer(props.get('auth')).toString("base64")

            var restEndpoint =`curl -d '{ "arg": "value" }' '${props.host()}namespaces/${result.namespace}/actions/${result.name}?blocking=true' -XPOST -H 'Authorization: Basic ${hash}' -H 'Content-Type: application/json'`;

            log.appendLine(`\nCURL REST invocation (You still need to set parameter key/value pairs):`);
            log.appendLine(`-------------------------------------------------------------------------`);
            log.appendLine(`\n${restEndpoint}`);
        })
        .catch(function(error) {
            util.printOpenWhiskError(error);
        });
    });
}



let nodeTemplate = "var request = require('request');\n" +
    "\n" +
    "function main(msg) {\n" +
    "    var url = 'https://httpbin.org/get';\n" +
    "    request.get(url, function(error, response, body) {\n" +
    "        whisk.done({msg: body});\n" +
    "    });\n" +
    "    return whisk.async();\n" +
    "}\n";


let swiftTemplate = "/**\n" + 
    " * Sample code using the experimental Swift 3 runtime\n" + 
    " * with links to KituraNet and GCD\n" + 
    " */\n" + 
    "\n" + 
    "import KituraNet\n" + 
    "import Dispatch\n" + 
    "import Foundation\n" + 
    "\n" + 
    "func main(args:[String:Any]) -> [String:Any] {\n" + 
    "\n" + 
    "    // Force KituraNet call to run synchronously on a global queue\n" + 
    "    var str = \"No response\"\n" + 
    "    dispatch_sync(dispatch_get_global_queue(0, 0)) {\n" + 
    "\n" + 
    "            Http.get(\"https://httpbin.org/get\") { response in\n" + 
    "\n" + 
    "                do {\n" + 
    "                   str = try response!.readString()!\n" + 
    "                } catch {\n" + 
    "                    print(\"Error \(error)\")\n" + 
    "                }\n" + 
    "\n" + 
    "            }\n" + 
    "    }\n" + 
    "\n" + 
    "    // Assume string is JSON\n" + 
    "    print(\"Got string \(str)\")\n" + 
    "    var result:[String:Any]?\n" + 
    "\n" + 
    "    // Convert to NSData\n" + 
    "    let data = str.bridge().dataUsingEncoding(NSUTF8StringEncoding)!\n" + 
    "    do {\n" + 
    "        result = try NSJSONSerialization.jsonObject(with: data, options: []) as? [String: Any] + \n" + 
    "    } catch {\n" + 
    "        print(\"Error \(error)\")\n" + 
    "    }\n" + 
    "\n" + 
    "    // return, which should be a dictionary\n" + 
    "    print(\"Result is \(result!)\")\n" + 
    "    return result!\n" + 
    "}\n";


module.exports = {
  register: register,
  list:list
};