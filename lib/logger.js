var Util = require('util');

//////////////////////////////////////////////////////////////////////////////

function LoggerBase(defaultContext)
{
    this.defaultContext = defaultContext || "";

    this.ERROR = 'error';
    this.WARNING = 'warning';
    this.INFO = 'info';
    this.DEBUG = 'debug'
    this.TRACE = 'trace';

    // bind all __ prefixed functions to this(this,..)
    for (var fn in this)
    {
        if (typeof this[fn] == 'function' && fn.match(/^__/))
            this[fn.substring(2)] = this[fn].bind(this, this);
    }
}

LoggerBase.prototype.__contextualize = function (me, context, append) // virtual LoggerBase (string context, bool append = false)
{
    var f = new me.constructor();
    if (append !== true)
        f.defaultContext = context;
    else
    {
        if (me.defaultContext.length)
            f.defaultContext = me.defaultContext + ": " + context;
        else
            f.defaultContext = context;
    }
    return f;
}

LoggerBase.prototype.__args = function (me, args, skip)
{
    var nargs = [];
    for (var i = skip; args.length > i; i++) nargs.push(args[i]);
    return nargs;
}

LoggerBase.prototype.__format = function (me, level, vars, args)
{
    var nice = function (a)
    {
        if (a instanceof Error)
            return JSON.stringify({ "err": { name: a.name, message: a.message } });
        else if (typeof a == 'object')
            return JSON.stringify(a)
        else
            return a;
    }

    if (args == null && vars != null) { args = vars; vars = null; }
    var s = "[" + level + "] ("
        + (vars ? (typeof vars == 'string' ? vars : (vars.context || this.defaultContext)) : this.defaultContext)
        + ") "
        + (args instanceof Array ? args.map(nice).join(" ") : args);

    return s;
}

LoggerBase.prototype.__log = function (me, level, vars, args)
{
    // empty default
}

LoggerBase.prototype.__process = function (me, level, vars, args)
{
    if (typeof vars != 'object')
    {
        vars = { context: vars }
    }
    vars.when = new Date()
    me.log(level, vars, args);
}

LoggerBase.prototype.__error = function (me, args)
{
    me.process(me.ERROR, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__warning = function (me, args)
{
    me.process(me.WARNING, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__info = function (me, args)
{
    me.process(me.INFO, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__debug = function (me, args)
{
    me.process(me.DEBUG, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__trace = function (me, args)
{
    me.process(me.TRACE, {}, me.args(arguments, 1));
}

//////////////////////////////////////////////////////////////////////////////

function ConsoleLogger(defaultContext)
{
    LoggerBase.call(this, defaultContext);
}
Util.inherits(ConsoleLogger, LoggerBase)

ConsoleLogger.prototype.__log = function (me, level, vars, args)
{
    switch (level)
    {
        case me.ERROR:
        case me.WARNING:
            console.error(me.format(level, vars, args));
        default:
            console.log(me.format(level, vars, args));
    }
}

//////////////////////////////////////////////////////////////////////////////

function NullLogger(defaultContext)
{
    LoggerBase.call(this, defaultContext);
}
Util.inherits(NullLogger, LoggerBase)

NullLogger.prototype.__log = function () { }
NullLogger.prototype.__process = function () { }
NullLogger.prototype.__error = function () { }
NullLogger.prototype.__warning = function () { }
NullLogger.prototype.__info = function () { }
NullLogger.prototype.__debug = function () { }
NullLogger.prototype.__trace = function () { }

//////////////////////////////////////////////////////////////////////////////

module.exports =
{
    LoggerBase: LoggerBase,
    NullLogger: NullLogger,
    ConsoleLogger: ConsoleLogger
}