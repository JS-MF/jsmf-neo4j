/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet
*/

/* **************************************
TODO:
    - add logger
    - make a version with batch processing
    - read from DB
    - update nodes/model
*************************************** */
'use strict'

const neo4j = require('neo4j-driver').v1
    , _ = require('lodash')
    , JSMF = require('jsmf-core')


let driver

module.exports = function init(url, user, password) {
  if (user !== undefined && password !== undefined) {
    driver = neo4j.driver(url, neo4j.auth.basic(user, password))
  } else if (user === undefined && password === undefined) {
    driver = neo4j.driver(url)
  } else  {
    throw new Error('Invalid user/password pair')
  }
}

module.exports.close = () => driver.close()

module.exports.saveModel = function saveModel(m) {
  const elements = m.elements()
  const session = driver.session()
  return saveElements(elements, session)
    .then(m => saveRelationships(elements, m, session))
    .then(() => session.close())
}

module.exports.loadModel = function loadModel(mm) {
  const session = driver.session()
  const classes = _.map(mm.modellingElements, x => x[0])
  return Promise.all(_.map(classes, k => loadElements(k, session)))
    .then(elementsByClass =>
        _.flatMap(elementsByClass, elements => {
          const cls = elements[0]
          const records = elements[1].records
          return _.flatMap(records, x => refillAttributes(cls, x.get('a'), session))
        })
    )
    .then(elements => filterClassHierarchy(elements))
    .then(elements => new Map(_.map(elements, e => [JSMF.jsmfId(e), e])))
    .then(elements => refillReferences(classes, elements, session))
    .then(values => new JSMF.Model('LoadedModel', mm, [...values.values()]))
}

function loadElements(cls, session) {
  const query = `MATCH (a:${cls.__name}) RETURN (a)`
  return session.run(query).then(x => [cls, x])
}

function refillAttributes(cls, e) {
  const res = cls.newInstance()
  _.forEach(cls.getAllAttributes(), (t, x) => res[x] = e.properties[x])
  res.__jsmf__.uuid = e.properties.__jsmf__
  return res
}

function filterClassHierarchy(elements) {
  const res = _.reduce(elements, (acc, e) => checkElement(acc, e), new Map())
  return Array.from(res.values())
}

function checkElement(m, elem) {
  const elemId = JSMF.jsmfId(elem)
  const old = m.get(elemId)
  if (old === undefined) { m.set(elemId, elem) }
  else {
    const oldClasses = old.conformsTo().getInheritanceChain()
    if (!_.includes(oldClasses, elem.conformsTo())) {
      m.set(elemId, elem)
    }
  }
  return m
}

function refillReferences(classes, elements, session) {
  const silentProperties = new Set()
  return Promise.all(
      _(classes).flatMap(x => _.map(x.getAllReferences(), (ref, refName) => [x, ref, refName]))
            .map(x => refillReference(x[2], x[0], x[1], elements, silentProperties, session))
            .value()).then(() => elements)
}

function refillReference(refName, cls, ref, elements, silentProperties, session) {
  if (silentProperties.has(refName)) { return undefined }
  silentProperties.add(refName)
  if (ref.opposite != undefined) { silentProperties.add(ref.opposite)}
  const query = `MATCH (s:${cls.__name})-[a:${refName}]->(t:${ref.type.__name}) RETURN s, t, a`
  return session.run(query)
    .then(res => _.map(res.records,
                  rec => resolveReference(refName, cls, rec.get('s'),
                                          ref.type, rec.get('t'),
                                          ref.associated, rec.get('a'),
                                          elements)))
}

function resolveReference(name, srcClass, s, targetClass, t, associatedClass, a, elements) {
  const source = resolveElement(srcClass, s, elements)
  const target = resolveElement(targetClass, t, elements)
  const setterName = 'add' + name[0].toUpperCase() + name.slice(1)
  if (!_.isEmpty(a.properties)) {
    resolveElement(associatedClass, a, elements)
    source[setterName](target, resolveElement(associatedClass, a, elements))
  } else {
    source[setterName](target)
  }
}

function resolveElement(cls, e, elements) {
  const key = e.properties.__jsmf__
  let res = elements.get(key)
  if (!res) {
    res = refillAttributes(cls, e)
    elements.set(key, res)
  }
  return res
}

function saveElements(es, session) {
  return Promise.all(_.map(es, x => saveElement(x, session))).then(v => new Map(v))
}

function saveElement(e, session) {
  const dry = dryElement(e)
  const classes = _.map(e.conformsTo().getInheritanceChain(), '__name')
  const params = '{'
               + _.map(dry, (v, k) => `${k}: { ${k} }`).join(', ')
               + '}'
  const query = `CREATE (x:${classes.join(':')} ${params}) RETURN (x)`
  return session.run(query, dry).then(v => [e, v.records[0].get(0).identity])
}

function saveRelationships(es, elemMap, session) {
  const relations = _.flatMap(es, e => saveElemRelationships(e, elemMap, session))
  return Promise.all(relations)
}

function saveElemRelationships(e, elemMap, session) {
  const references = e.conformsTo().getAllReferences()
  return _.flatMap(references, (v, r) => saveElemRelationship(e, r, elemMap, session))
}

function saveElemRelationship(e, ref, elemMap, session) {
  const associated = new Map(_.map(e.getAssociated(ref), a => [a.elem, a.associated]))
  const referenced = e[ref]
  return _.map(referenced, t => saveRelationship(e, ref, t, associated.get(t), elemMap, session))
}

function saveRelationship(source, ref, target, associated, elemMap, session) {
  const statements = [ 'MATCH (s) WHERE id(s) in { sourceId }'
                     , 'MATCH (t) WHERE id(t) in { targetId }'
                     , `CREATE (s) -[r:${ref}${associated ? ' { associated }' : ''}]-> (t)`
                     , 'RETURN r'
                     ]
  const sourceId = elemMap.get(source)
  const targetId = elemMap.get(target)
  if (associated !== undefined) {
    const associatedId = elemMap.get(associated)
    if (associatedId === undefined) {
      saveElement(associated, session)
    }
    associated = associated ? dryElement(associated) : undefined
  }
  const params = Object.assign({sourceId, targetId}, associated!==undefined?{associated}:{})
  return session.run(statements.join(' '), params)
}

function dryElement(e) {
  const attributes = e.conformsTo().getAllAttributes()
  const jid = JSMF.jsmfId(e)
  return _.reduce(attributes, function (res, a, k) {res[k] = e[k]; return res}, {__jsmf__: jid})
}
