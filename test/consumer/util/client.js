
var url = require('url')
var qs = require('qs')

var express = require('express')
var session = require('express-session')
var cookiesession = require('cookie-session')
var bodyParser = require('body-parser')

var Koa = require('koa')
var koasession = require('koa-session')
var koabody = require('koa-bodyparser')
var mount = require('koa-mount')
var convert = require('koa-convert')
var koaqs = require('koa-qs')

var {Hapi, yar} = (() => {
  var load = (prefix) => ({
    Hapi: require(`${prefix}hapi`),
    yar: require(`${prefix}yar`)
  })
  try {
    return load('')
  }
  catch (err) {
    return load('@hapi/')
  }
})()

var Grant = require('../../../')

var version = {
  express: 4,
  koa: parseInt(require('koa/package.json').version.split('.')[0]),
  hapi: (() => {
    try {
      return parseInt(require('hapi/package.json').version.split('.')[0])
    }
    catch (err) {
      return parseInt(require('@hapi/hapi/package.json').version.split('.')[0])
    }
  })()
}

var _Koa = Koa
Koa = function () {
  var app = new _Koa()

  if (version.koa >= 2) {
    var _use = app.use
    app.use = (mw) => _use.call(app, convert(mw))
  }

  return app
}

var client = async ({test, handler, config, hook, extend, port = 5001}) => {
  var _handler = () => handler === 'hapi'
    ? `${handler}${version.hapi < 17 ? '' : '17'}`
    : handler

  var {grant, server, app} = await clients[test][_handler()]({config, hook, extend, port})
  return {
    grant,
    server,
    app,
    url: (path) => `http://localhost:${port}${path}`,
    close: () => new Promise((resolve) => {
      handler === 'hapi' && version.hapi >= 17
        ? server.stop().then(resolve)
        : server[/express|koa/.test(handler) ? 'close' : 'stop'](resolve)
    })
  }
}

var clients = {
  'handlers': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use(grant)
      app.get('/', callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(grant)
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server()
      server.connection({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi})

      server.register([
        {register: grant},
        {register: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ],
      () => server.start(() => resolve({grant, server})))
    }),
    hapi17: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi17})

      server.register([
        {plugin: grant},
        {plugin: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
  'missing-session': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(grant)
      app.use((err, req, res, next) => {
        res.end(err.message)
      })

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.use(function* (next) {
        try {
          yield next
        }
        catch (err) {
          this.body = err.message
        }
      })
      app.use(grant)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({debug: {request: false}})
      server.connection({host: 'localhost', port})

      server.register([
        {register: grant}
      ],
      () => {
        // server.on('request-error', (req, err) => {
        //   t.equal(err.message, 'Uncaught error: Grant: register session plugin first')
        // })
        server.start(() => resolve({grant, server}))
      })
    }),
    hapi17: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({host: 'localhost', port})
      // server.events.on('request', (event, tags) => {
      //   t.equal(tags.error.message, 'Grant: register session plugin first')
      // })

      server.register([
        {plugin: grant}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
  'missing-parser': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use(grant)
      app.use((err, req, res, next) => {
        res.end(err.message)
      })

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(function* (next) {
        try {
          yield next
        }
        catch (err) {
          this.body = err.message
        }
      })
      app.use(grant)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
  },
  'path-prefix': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use('/prefix', grant)
      app.get('/', callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(mount('/prefix', grant))
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server()
      server.connection({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi})

      server.register([
        {routes: {prefix: '/prefix'}, register: grant},
        {register: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ],
      () => server.start(() => resolve({grant, server})))
    }),
    hapi17: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi17})

      server.register([
        {routes: {prefix: '/prefix'}, plugin: grant},
        {plugin: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
  'dynamic-state': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use((req, res, next) => {
        if (/^\/connect/.test(req.url)) {
          res.locals.grant = {dynamic: {key: 'very', secret: 'secret'}}
        }
        next()
      })
      app.use(grant)
      app.get('/', callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(function* (next) {
        if (/^\/connect/.test(this.path)) {
          this.state.grant = {dynamic: {key: 'very', 'secret': 'secret'}}
        }
        yield next
      })
      app.use(grant)
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server()
      server.connection({host: 'localhost', port})
      server.ext('onPreHandler', (req, res) => {
        if (/^\/connect/.test(req.path)) {
          req.plugins.grant = {dynamic: {key: 'very', 'secret': 'secret'}}
        }
        res.continue()
      })
      server.route({method: 'GET', path: '/', handler: callback.hapi})

      server.register([
        {register: grant},
        {register: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ],
      () => server.start(() => resolve({grant, server})))
    }),
    hapi17: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({host: 'localhost', port})
      server.ext('onPreHandler', (req, res) => {
        if (/^\/connect/.test(req.path)) {
          req.plugins.grant = {dynamic: {key: 'very', 'secret': 'secret'}}
        }
        return res.continue
      })
      server.route({method: 'GET', path: '/', handler: callback.hapi17})

      server.register([
        {plugin: grant},
        {plugin: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
  'transport-state': {
    express: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use(grant)
      app.use(callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(grant)
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    'koa-before': ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(callback['koa-before'])
      app.use(grant)
      koaqs(app)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server()
      server.connection({host: 'localhost', port})
      server.ext('onPostHandler', (req, res) => {
        if (/\/callback$/.test(req.path)) {
          callback.hapi(req, res)
          return
        }
        res.continue()
      })

      server.register([
        {register: grant},
        {register: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ],
      () => server.start(() => resolve({grant, server})))
    }),
    hapi17: ({config, port}) => new Promise((resolve) => {
      var grant = Grant.hapi()(config)

      var server = new Hapi.Server({host: 'localhost', port})
      server.ext('onPostHandler', (req, res) => {
        if (/\/callback$/.test(req.path)) {
          return callback.hapi17(req, res)
        }
        return res.continue
      })

      server.register([
        {plugin: grant},
        {plugin: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
  'third-party': {
    'express-cookie': ({config, port}) => new Promise((resolve) => {
      var grant = Grant.express()(config)

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(cookiesession({signed: true, secret: 'grant', maxAge: 60 * 1000}))
      app.use(grant)
      app.get('/', callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    'koa-mount': ({config, port}) => new Promise((resolve) => {
      var grant = Grant.koa()(config)

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(mount(grant))
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
  },
  'extend-hook': {
    express: ({config, hook, extend, port}) => new Promise((resolve) => {
      var grant = Grant({config, handler: 'express', hook, extend})

      var app = express()
      app.use(bodyParser.urlencoded({extended: true}))
      app.use(session({secret: 'grant', saveUninitialized: true, resave: false}))
      app.use(grant)
      app.get('/', callback.express)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    koa: ({config, hook, extend, port}) => new Promise((resolve) => {
      var grant = Grant({config, handler: 'koa', hook, extend})

      var app = new Koa()
      app.keys = ['grant']
      app.use(koasession(app))
      app.use(koabody())
      app.use(grant)
      koaqs(app)
      app.use(callback.koa)

      var server = app.listen(port, () => resolve({grant, server, app}))
    }),
    hapi: ({config, hook, extend, port}) => new Promise((resolve) => {
      var grant = Grant({config, handler: 'hapi', hook, extend})

      var server = new Hapi.Server()
      server.connection({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi})

      server.register([
        {register: grant},
        {register: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ],
      () => server.start(() => resolve({grant, server})))
    }),
    hapi17: ({config, hook, extend, port}) => new Promise((resolve) => {
      var grant = Grant({config, handler: 'hapi', hook, extend})

      var server = new Hapi.Server({host: 'localhost', port})
      server.route({method: 'GET', path: '/', handler: callback.hapi17})

      server.register([
        {plugin: grant},
        {plugin: yar, options: {cookieOptions:
          {password: '01234567890123456789012345678912', isSecure: false}}}
      ])
      .then(() => server.start().then(() => resolve({grant, server})))
    }),
  },
}

var callback = {
  express: (req, res) => {
    res.writeHead(200, {'content-type': 'application/json'})
    res.end(JSON.stringify({
      session: req.session.grant,
      response: (res.locals.grant || {}).response || req.session.grant.response || req.query,
      state: res.locals.grant,
    }))
  },
  koa: function* () {
    if (this.path === '/' || /\/callback$/.test(this.path)) {
      this.response.status = 200
      this.set('content-type', 'application/json')
      this.body = JSON.stringify({
        session: this.session.grant,
        response: (this.state.grant || {}).response || this.session.grant.response || this.request.query,
        state: this.state.grant,
      })
    }
  },
  'koa-before': function* (next) {
    yield next
    if (this.path === '/' || /\/callback$/.test(this.path)) {
      this.response.status = 200
      this.set('content-type', 'application/json')
      this.body = JSON.stringify({
        session: this.session.grant,
        response: (this.state.grant || {}).response || this.session.grant.response || this.request.query,
        state: this.state.grant,
      })
    }
  },
  hapi: (req, res) => {
    var parsed = url.parse(req.url, false)
    var query = qs.parse(parsed.query)
    res({
      session: (req.session || req.yar).get('grant'),
      response: (req.plugins.grant || {}).response || (req.session || req.yar).get('grant').response || query,
      state: req.plugins.grant,
    })
  },
  hapi17: (req, res) => {
    var query = qs.parse(req.query)
    return res.response({
      session: req.yar.get('grant'),
      response: (req.plugins.grant || {}).response || req.yar.get('grant').response || query,
      state: req.plugins.grant,
    })
  }
}

module.exports = client
