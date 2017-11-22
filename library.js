// Sort by Date
"use strict";

let Categories = require.main.require('./src/categories')
let User = require.main.require('./src/user')
let Topics = require.main.require('./src/topics')
let SocketAdmin = require.main.require('./src/socket.io/admin')
let db = require.main.require('./src/database')

let async = require.main.require('async')
let winston = require.main.require('winston')
let nconf = require.main.require('nconf')
let _ = require.main.require('lodash')

let utils = require.main.require('./public/src/utils')

let version = '1.4.8'

exports.init = (params, next) => {
  winston.info('[sort-by-date] Loading sort by date...')

  params.router.get('/admin/plugins/category-sort-by-date', params.middleware.admin.buildHeader, renderAdmin)
  params.router.get('/api/admin/plugins/category-sort-by-date', renderAdmin)

  function renderAdmin (req, res, next) {
    res.render('admin/plugins/category-sort-by-date', {})
  }

  let getTopicIds = Categories.getTopicIds

  Categories.getTopicIds = function (data, next) {
    let { sort, cid, start, stop, } = data

    if (sort !== 'topics_newest_to_oldest' && sort !== 'topics_oldest_to_newest') return getTopicIds(data, next)

    let pinnedTids

    let method, min, max, set

    if (sort === 'topics_oldest_to_newest') {
      method = 'getSortedSetRevRangeByLex'
      min = '+'
      max = '-'
    } else {
      method = 'getSortedSetRangeByLex'
      min = '-'
      max = '+'
    }

    async.waterfall([
      next => {
        let dataForPinned = _.cloneDeep(data)

        dataForPinned.start = 0
        dataForPinned.stop = -1

        Categories.getPinnedTids(dataForPinned, next)
      },
      (_pinnedTids, next) => {
        let totalPinnedCount = _pinnedTids.length

        pinnedTids = _pinnedTids.slice(start, stop === -1 ? undefined : stop + 1);

        let pinnedCount = pinnedTids.length;

        let topicsPerPage = stop - start + 1;

        let normalTidsToGet = Math.max(0, topicsPerPage - pinnedCount);

        if (!normalTidsToGet && stop !== -1) return next(null, [])

        set = `cid:${cid}:tids:csbt`

        if (start > 0 && totalPinnedCount) start -= totalPinnedCount - pinnedCount

        stop = stop === -1 ? stop : start + normalTidsToGet - 1

        db[method](set, min, max, start, stop - start, next)
      },
      (topicValues, next) => {
        let tids = []
		    let tid = ''

        topicValues.forEach(function (value) {
          tid = value.split(':')
          tid = tid[tid.length - 1]
          tids.push(tid)
        })

        next(null, tids)
      },
      (normalTids, next) => {
        normalTids = normalTids.filter(tid => pinnedTids.indexOf(tid) === -1)

        next(null, pinnedTids.concat(normalTids))
      },
    ], next)
  }

  SocketAdmin.sortbydate = {}
  SocketAdmin.sortbydate.reindex = (socket, data, next) => {
    reindex(next)
  }

  next()

  if (!(nconf.get('isPrimary') === 'true' && !nconf.get('jobsDisabled'))) return

  db.get('sortbydate', function (err, ver) {
    if (err) return
    if (ver === version) return

    reindex()
  })
}

function reindex(next) {
  next = next || (() => {})

  winston.info('[sort-by-date] Re-indexing topics...')

  async.waterfall([
    async.apply(db.getSortedSetRange, 'categories:cid', 0, -1),
    function (cids, next) {
      let keys = cids.map(function (cid) { return 'cid:' + cid + ':tids:csbt' })

      db.deleteAll(keys, next)
    },
    async.apply(db.getSortedSetRange, 'topics:tid', 0, -1),
    function (tids, next) {
      Topics.getTopicsFields(tids, ['tid', 'cid', 'timestamp'], next)
    },
    function (topics, next) {
      async.each(topics, function (topic, next) {
        db.sortedSetAdd('cid:' + topic.cid + ':tids:csbt', 0, topic.timestamp + ':' + topic.tid, next)
      }, next)
    },
    async.apply(db.set, 'sortbydate', version),
  ], (err) => {
    next(err)
    if (err) {
      winston.error(err)
    } else {
      winston.info('[sort-by-date] Finished re-indexing topics.')
    }
  })
}

exports.topicPost = function (data) {
  let topic = data.topic

  db.sortedSetAdd('cid:' + topic.cid + ':tids:csbt', 0, topic.timestamp + ':' + topic.tid)

}

exports.topicPurge = function (data) {
  let topic = data.topic
  db.sortedSetRemove('cid:' + topic.cid + ':tids:csbt', topic.timestamp + ':' + topic.tid)
}

exports.topicMove = function (topic) {
  Topics.getTopicField(topic.tid, 'timestamp', function (err, timestamp) {
    db.sortedSetRemove('cid:' + topic.fromCid + ':tids:csbt', timestamp + ':' + topic.tid)
    db.sortedSetAdd('cid:' + topic.toCid + ':tids:csbt', 0, timestamp + ':' + topic.tid)
  })
}

exports.categoryDelete = function (data) {
  let cid = data.cid

  db.delete('cid:' + cid + ':tids:csbt')
}

exports.adminBuild = (header, next) => {
  header.plugins.push({
    route : '/plugins/category-sort-by-date',
    icon  : 'fa-sort-alpha-asc',
    name  : 'Category Sort by Date'
  })

  next(null, header)
}
