"use strict";

const Router = require('koa-router');
const Participant = require('mongoose').model('Participant');
const Task = require('mongoose').model('Task');
const bodyParser = require('koa-body')();
const Auth = require(__dirname + '/../../../auth');
const Middleware = require(__dirname + '/../../../lib/middleware');

module.exports = function (projectRouter) {

  const taskPopulateOptions = [{
    path: 'creator',
    model: 'User'
  },{
    path : 'participants',
    model: 'Participant',
    populate: {
      path: 'user',
      model: 'User'
    }
  }];

  const taskRouter = new Router({ prefix: '/:project/tasks' });

  taskRouter.get('/', Auth.ensureAuthenticated, Auth.ensureUser, Middleware.ensureActiveProjectParticipant, function *() {
    try {
      const tasks = yield Task.find({ project: this.params.project }).sort({ created: 1 }).populate(taskPopulateOptions).exec();

      this.apiRespond(tasks);
    } catch (err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
    }
  });

  taskRouter.post('/', Auth.ensureAuthenticated, Auth.ensureUser, Middleware.ensureActiveProjectParticipant, bodyParser, function *() {
    if ( !(this.request.body.title && this.request.body.title.trim()) ) {
      this.throw(400, 'required_parameter_missing');
      return;
    }

    const title = this.request.body.title.trim();
    const description = this.request.body.description;
    const start = this.request.body.start ? new Date(this.request.body.start) : undefined;
    const end = this.request.body.end ? new Date(this.request.body.end) : undefined;

    if ( ( start && !end ) || ( !start && end ) ) {
      this.throw(400, 'either_both_dates_or_none');
      return;
    }

    if ( start && end && end < start ) {
      this.throw(400, 'end_date_before_start');
      return;
    }

    try {
      let task = new Task({
        title: title,
        description: description,
        start: start,
        end: end,
        creator: this.user._id,
        project: this.params.project,
      });

      task = yield task.save();

      task = yield Task.populate(task, taskPopulateOptions);

      this.emitApiAction('create', 'task', task, this.user);

      this.apiRespond(task);
    } catch(err) {
      console.error(err);
      this.throw(500, 'creation_failed');
    }
  });

  taskRouter.put('/:task', Auth.ensureAuthenticated, Auth.ensureUser, Middleware.ensureActiveProjectParticipant, bodyParser, function *() {
    let task;

    try {
      task = yield Task.findOne({ _id: this.params.task }).exec();
    } catch(err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
      return;
    }

    if ( !task ) {
      this.throw(404, 'not_found');
      return;
    }

    if ( !task.project.equals(this.params.project) ) {
      this.throw(403, 'permission_error');
      return;
    }

    if ( this.request.body.title ) {
      task.title = this.request.body.title.trim();
    } else {
      this.throw(400, 'required_parameter_missing');
      return;
    }
    if ( this.request.body.description !== undefined ) {
      task.description = this.request.body.description;
    }

    const start = this.request.body.start ? new Date(this.request.body.start) : undefined;
    const end = this.request.body.end ? new Date(this.request.body.end) : undefined;

    if ( ( start && !end ) || ( !start && end ) ) {
      this.throw(400, 'either_both_dates_or_none');
      return;
    }

    if ( start && end && end < start ) {
      this.throw(400, 'end_date_before_start');
      return;
    }

    if ( start && end ) {
      task.start = start;
      task.end = end;
    } else if ( start === undefined && end === undefined && task.start && task.end ) {
      task.start = start;
      task.end = end;
    }

    // TODO Check about connection to participant, resource and document
    try {
      task = yield task.save();

      task = yield Task.populate(task, taskPopulateOptions);

      this.emitApiAction('update', 'task', task, this.user);

      this.apiRespond(task);
    } catch(err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
    }
  });

  taskRouter.post('/:task/participants/:participant', Auth.ensureAuthenticated, Auth.ensureUser, Middleware.ensureActiveProjectParticipant, bodyParser, function *() {
    let task, participant;

    try {
      task = yield Task.findOne({ _id: this.params.task }).exec();
    } catch(err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
      return;
    }

    if ( !task ) {
      this.throw(404, 'not_found');
      return;
    }

    if ( !task.project.equals(this.params.project) ) {
      this.throw(403, 'permission_error');
      return;
    }

    try {
      participant = yield Participant.findOne({ project: this.params.project, _id: this.params.participant }).exec();
    } catch (err){
      console.error(err);
      this.throw(404, 'not_found');
      return;
    }

    if (task.participants.indexOf(participant._id) === -1) {
      task.participants.push(participant._id);
    } else {
      this.throw(409, 'already_is_a_participant');
      return;
    }

    try {

      task = yield task.save();

      task = yield Task.populate(task, taskPopulateOptions);

      this.emitApiAction('update', 'task', task, this.user);

      this.apiRespond(task);
    } catch(err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
    }
  });

  taskRouter.delete('/:task', Auth.ensureAuthenticated, Auth.ensureUser, Middleware.ensureActiveProjectParticipant, function *() {
    let task;

    try {
      task = yield Task.findOne({ _id: this.params.task }).exec();
    } catch(err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
      return;
    }

    if ( !task ) {
      this.throw(404, 'not_found');
      return;
    }

    if ( !task.project.equals(this.params.project) ) {
      this.throw(403, 'permission_error');
      return;
    }

    try {
      yield task.remove();

      this.emitApiAction('delete', 'task', task, this.user);

      this.apiRespond(task);
    } catch (err) {
      console.error(err);
      this.throw(500, 'internal_server_error');
    }
  });

  projectRouter.use('', taskRouter.routes(), taskRouter.allowedMethods());
};
