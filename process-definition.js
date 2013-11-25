var util = require('util');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
_.str = require('underscore.string');
_.mixin(_.str.exports());
var Datastore = require('nedb');
var Q = require('q');

/**
* [CORE] Task Definition: Represent a abstract task in the process definition
*/
function Task(type) {
  this.id = null;
  this.name = null;
  this.type = type;
  this.incomingFlows = [];
  this.outgoingFlows = [];
}

Task.prototype.serialize = function () {
  function handleFlow(flow) {
    return {
        from: flow.from.id,
        to: flow.to.id,
        condition: this.condition ? this.condition.toString() : null
      };
  }
  var entity = {
    id: this.id,
    type: this.type,
    incomingFlows: this.incomingFlows.map(function (flow) {
      return handleFlow(flow);
    }),
    outgoingFlows: this.outgoingFlows.map(function (flow) {
      return handleFlow(flow);
    })
  };
  return entity;
};

Task.prototype.deserialize = function (entity) {
  this.id = entity.id;
  this.type = entity.type;
};

/**
 * A factory method for deserialize the all kinds of Task
 * The subclass must provide a deserialize method in its prototype for extension
 * @param  {[TaskEntity]} entity
 * @return {[Task]}
 */
Task.deserialize = function (entity) {
  var task = processBuilder.createTask(entity.type);
  task.deserialize(entity);
  return task;
};

/**
 * Exclusive Gateway
 */
function Decision() {
  Decision.super_.apply(this, arguments);
  this.type = 'decision';
}
util.inherits(Decision, Task);

function ServiceTask(action) {
  ServiceTask.super_.apply(this, arguments);
  this.type = 'service-task';
  this.action = action;
}
util.inherits(ServiceTask, Task);

ServiceTask.prototype.serialize = function () {
  var entity = ServiceTask.super_.prototype.serialize.call(this);
  entity.action = this.action.toString();
  return entity;
};

ServiceTask.prototype.deserialize = function (entity) {
  ServiceTask.super_.prototype.deserialize.call(this, entity);
  eval('this.action = ' + entity.action);
};


/**
 * The factory class to create different kinds of tasks for the client
 */
function ProcessBuilder() {
  this.startTask = function () {
    return new Task('start-task');
  };
  this.endTask = function () {
    return new Task('end-task');
  };
}
ProcessBuilder.prototype.registerTask = function (type, Task) {
  this[_.camelize(type)] = function () {
    var task = new Task();
    Task.apply(task, arguments);
    return task;
  };
};
ProcessBuilder.prototype.createTask = function (type) {
  return this[_.camelize(type)]();
};
var processBuilder = new ProcessBuilder();


/**
 * [CORE] The definiton of the process which can be executed by process engine
 */
function ProcessDefinition() {
  this.tasks = {};
  this.nextTaskId = 0;
}

ProcessDefinition.prototype.addTask = function (task) {
  var id = task.id ? task.id : this.nextTaskId++;
  task.id = id;
  this.tasks[id] = task;
};
/**
 * create a flow
 * 
 * @param {[task]} taskFrom
 * @param {[task]} taskTo
 * @param {[function]} condition
 */
ProcessDefinition.prototype.addFlow = function (taskFrom, taskTo, condition) {
  var flow = {
    from: taskFrom,
    to: taskTo,
    condition: condition
  };
  taskTo.incomingFlows.push(flow);
  taskFrom.outgoingFlows.push(flow);
};

ProcessDefinition.prototype.serialize = function () {
  var entities = [];
  _.forOwn(this.tasks, function (task) {
    entities.push(task.serialize());
  }, this);
  return entities;
};

ProcessDefinition.deserialize = function (entity) {
  var def = new ProcessDefinition();
  entity.forEach(function (taskEntity) {
    def.addTask(Task.deserialize(taskEntity));
  });

  entity.forEach(function (taskEntity) {
    function deserializeFlow(flow) {
      var deserializedFlow = {
        from: def.tasks[flow.from],
        to: def.tasks[flow.to]
      };
      eval('deserializedFlow.condition = ' + flow.condition);
      return deserializedFlow;
    }

    def.tasks[taskEntity.id].incomingFlows = taskEntity.incomingFlows.map(function (flow) {
      return deserializeFlow(flow);
    });
    def.tasks[taskEntity.id].outgoingFlows = taskEntity.outgoingFlows.map(function (flow) {
      return deserializeFlow(flow);
    });
  });

  return def;
};


module.exports = {
  ProcessDefinition: ProcessDefinition,
  processBuilder: processBuilder,
  Task: Task,
  ServiceTask: ServiceTask,
  Decision: Decision
};
