import express from 'express'
// import connection from '../db'
import mysql from 'promise-mysql'
const router = express.Router();


/*
    Create new user
    'post' will only be used to create a new blank user with member_id.
    returns member_id
 */
router.post('/', function(req, res) {
  // the following "placeholder" syntax is explained here: https://www.w3resource.com/node.js/nodejs-mysql.php#Escaping_query
  // let sql = "INSERT INTO members SET ?";
  let sql = "INSERT INTO `members` (`member_id`, `status`) VALUES (NULL, 'new')";
  mysql.createConnection(connectionConfig).then((conn) => {
    let result = conn.query(sql);
    conn.end()
    return result
  }).then((rows) => {
    // console.log('rows', typeof rows)
    // for (var property in rows) {
    //   if (rows.hasOwnProperty(property)) {
    //     console.log(property)
    //   }
    // }
    // console.log('rows', rows)
    // console.log('rows.insertId', rows.insertId)
    // create a member
    let member = {
      id: rows.insertId,
      firstName: '',
      lastName: '',
      email: '',
      exempt: 0,
      comment: '',
      phoneNumber: '',
      active: 1,
      status: 'edit',
    }
    res.send(member)
  }).catch((err) => {
    console.log('route members post /', err)
  })
})

// read
//
// memberId:           members.member_id
// firstName:          members.first_name
// lastName:           members.last_name
// email:              members.email
// exempt:             members.exempt
// comment:            members.comment
// phoneNumber:        members.phone_number
// active:             members.active
// lastServedDate:     MAX(history.date)
// lastServedRoleName: roles[history.role_id].role_name
// exclusions:         exlusions [role_id ...]
router.get('/', function(req, res) {
  // console.log('connectionConfig', connectionConfig)

  let members_sql = `
    SELECT m.member_id AS id, m.first_name AS firstName, m.last_name AS lastName, m.email, m.exempt,
           m.comment, m.phone_number AS phoneNumber, m.active, DATE_FORMAT(h.date, '%Y-%m-%d') AS lastRoleDate, r.role_name AS lastRoleName
    FROM members m
    LEFT JOIN history h ON h.member_id = m.member_id AND (h.date = (SELECT MAX(h1.date) FROM history h1 WHERE h1.member_id = m.member_id))
    LEFT JOIN roles r on r.role_id = h.role_id
    ORDER BY (h.history_id IS NULL) DESC, h.date ASC, m.last_name ASC
  `

  let asort_sql = 'SELECT member_id AS id FROM members ORDER BY last_name ASC'

  let exclusions_sql = `
    SELECT e.member_id AS id, GROUP_CONCAT(r.role_id) AS excludedRoleIds
    FROM exclusions e
    LEFT JOIN roles r ON r.role_id = e.role_id
    GROUP BY e.member_id
  `
  let db
  let asort = [], hsort = []
  let members = {}, exclusions = {}
  mysql.createConnection(connectionConfig).then((conn) => {
    db = conn
    return db.query(asort_sql)  // member IDs sorted by member last name
  }).then((rows) => {
    for (let i = 0; i < rows.length; i++) {
      asort[i] = rows[i]['id']
    }
    // console.log('memberIdsByAlpha', asort)

    return db.query(exclusions_sql)  // role exclusions
  }).then((rows) => {
    let mid
    for (let i = 0; i < rows.length; i++) {
      mid = rows[i]['id']
      exclusions[mid] = rows[i]['excludedRoleIds']
    }
    // console.log('exclusions', exclusions)

    return db.query(members_sql)  // members with history and role exclusions
  }).then((rows) => {
    db.end()
    let mid
    for (let i = 0; i < rows.length; i++) {
      mid = rows[i]['id']
      hsort[i] = mid
      members[mid] = Object.assign({}, rows[i])
      members[mid]['exclusions'] = exclusions[mid]
        ? exclusions[mid].split(',')
        : []
    }
    // console.log('members', members)
    // console.log('memberIdsByLastRoleDate', hsort)

    const members_full = {
      membersById: members,
      idsByAlpha: asort,
      idsByLastRoleDate: hsort,
    }
    // console.log('members_full', members_full)
    res.send(members_full)
  })
})

const logError = (err) => {
  const message = `{
    ERROR: query failed
    code: ${err.code},
    errno: ${err.errno},
    sqlMessage: ${err.sqlMessage},
    sqlState: ${err.sqlSTate},
    index: ${err.index},
    sql: ${err.sql},
  }`
  console.log('ERROR', message)
  return message
}
// update existing member (handles member information updates, active/inactive swtiching)
router.put('/:id', function(req, res) {
  const m = req.body.member
  let id = req.params.id
  let exclusions = m.exclusions
  // console.log('updated member in:', m)
  const updatedMember = {
    active: m.active,
    comment: m.comment,
    email: m.email,
    exempt: m.exempt,
    first_name: m.firstName,
    last_name: m.lastName,
    phone_number: m.phoneNumber,
    status: 'saved',
  }
  // console.log('updated member reformatted:', updatedMember)
  // the following "placeholder" syntax is explained here: https://www.w3resource.com/node.js/nodejs-mysql.php#Escaping_query
  let sqlMembers = "UPDATE members SET ? WHERE member_id = ?";

  let db
  mysql.createConnection(connectionConfig).then((conn) => {
    db = conn
    let result = conn.query(sqlMembers, [updatedMember, id])
    return result
  }).then((rows) => {
    db.query(`DELETE FROM exclusions WHERE member_id = ${id}`)
    for (let i=0; i<exclusions.length; i++) {
      db.query(`INSERT INTO exclusions (member_id, role_id) VALUES (?, ?)`, [ id, exclusions[i] ])
    }
    db.end()
    res.send('success')
  }).catch((err) => {
    // res.send(logError(err))
    console.log('err', err)
    res.status(400).end('error')
  })
})

// delete
router.delete('/:id', function(req, res) {
  // the following "placeholder" syntax is explained here: https://www.w3resource.com/node.js/nodejs-mysql.php#Escaping_query
  let sql = "DELETE FROM members WHERE member_id = ?";
  mysql.createConnection(connectionConfig).then((conn) => {
    let result = conn.query(sql, req.params.id)
    conn.end()
    return result
  }).then((rows) => {
    console.log('rows /n', rows)
    res.send(rows)
  })
})

module.exports = router;
