/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 'use strict';

const Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk
const config = require('../util/config');
const request = require('request');
const moment = require('moment');

// Create a Service Wrapper
let conversation = new Conversation(config.conversation);

let getConversationResponse = (message, context) => {
  let payload = {
    workspace_id: process.env.WORKSPACE_ID,
    context: context || {},
    input: message || {}
  };

  payload = preProcess(payload);

  return new Promise((resolved, rejected) => {
    // Send the input to the conversation service
    conversation.message(payload, function(err, data) {
      if (err) {
        rejected(err);
      }
      else{
        let processed = postProcess(data);
        if(processed){
          // return 값이 Promise 일 경우
          if(typeof processed.then === 'function'){
            processed.then(data => {
              resolved(data);
            }).catch(err => {
              rejected(err);
            })
          }
          // return 값이 변경된 data일 경우
          else{
            resolved(processed);
          }
        }
        else{
          // return 값이 없을 경우
          resolved(data);
        }
      }
    });
  })
}

let postMessage = (req, res) => {
  let message = req.body.input || {};
  let context = req.body.context || {};
  getConversationResponse(message, context).then(data => {
    return res.json(data);
  }).catch(err => {
    return res.status(err.code || 500).json(err);
  });
}

/** 
* 사용자의 메세지를 Watson Conversation 서비스에 전달하기 전에 처리할 코드
* @param  {Object} user input
*/ 
let preProcess = payload => {
  var inputText = payload.input.text; 
  console.log("User Input : " + inputText);
  console.log("Processed Input : " + inputText); 
  console.log("--------------------------------------------------");

  return payload;
}

/** 
 * Watson Conversation 서비스의 응답을 사용자에게 전달하기 전에 처리할 코드 
 * @param  {Object} watson response 
 */ 

let postProcess = response => { 
  console.log("Conversation Output : " + response.output.text);
  console.log("--------------------------------------------------");
  if(response.context && response.context.action){
    return doAction(response, response.context.action);
  }
}

/** 
 * 대화 도중 Action을 수행할 필요가 있을 때 처리되는 함수
 * @param  {Object} data : response object
 * @param  {Object} action 
 */ 
let doAction = (data, action) => {
  console.log("Action : " + action.command);
  switch(action.command){
    case "check-availability":
      return checkAvailability(data, action);
      break;
    case "confirm-reservation":
      return confirmReservation(data, action);
      break;
    // 사용자의 예약 리스트를 가져옵니다.
    case "check-reservation":
      return checkReservation(data, action);
      break;
    // 사용자의 예약 리스트 중 가장 빠른 시간의 예약만 가져옵니다. 
    case "check-next-reservation":
      return checkNextReservation(data, action);
      break;
    // 예약 취소의 목적으로 예약 리스트를 가져옵니다.
    case "check-reservation-for-cancellation":
      return checkReservation(data, action).then(data => {
        if(Array.isArray(data.output.text)){
          data.output.text.unshift("Please tell me the number of the reservation you want to cancel.");
        }
        return data;
      });
      break;
    // 예약을 취소합니다.
    case "confirm-cancellation":
      return confirmCancellation(data, action);
      break;
    default: console.log("Command not supported.")
  }
}

/** 
 * 회의실의 예약 가능 여부를 체크하는 함수
 * @param  {Object} data : response object
 * @param  {Object} action 
 */ 
let checkAvailability = (data, action) => {

  // Context로부터 필요한 값을 추출합니다.
  let date = action.dates;
  let startTime = action.times[0].value;
  let endTime = action.times[1]?action.times[1].value:undefined;

  // 날짜 값과 시간 값을 조합하여 시작 시간과 종료 시간을 Timestamp 형태로 변환합니다. 편의를 위해 종료 시간이 따로 명시되지 않는 경우 시작 시간에서 1시간 후로 설정하도록 합니다.
  let startTimestamp = new moment(date+"T"+startTime+"+0900");
  let endTimestamp = new moment(startTimestamp).hours(startTimestamp.hours() + 1);
  if(endTime){
    endTimestamp = new moment(date+" "+endTime);
  }
  
  // roomid는 편의상 하드코딩 합니다.
  let roomid = 'room1/camomile';

  // /freebusy/room은 roomid, start, end 값을 query parameter로 받아 해당 룸의 가용성을 리턴하는 api입니다.
  let reqOption = {
    method : 'GET',
    url : process.env.RBS_URL + '/freebusy/room',
    headers : {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    qs : {
      'roomid' : roomid,
      'start' : startTimestamp.valueOf(),
      'end' : endTimestamp.valueOf()
    }
  };
  
  return new Promise((resolved, rejected) => {
    request(reqOption, (err, res, body) => {
      if(err){
        rejected(err);
      }
      body = JSON.parse(body);


      // body.freebusy 의 length가 0보다 크면 기존에 예약정보가 있다는 의미로 해당 시간에 룸이 이미 예약되어 있음을 의미합니다. 그게 아니라면 해당 룸은 사용 가능한 상태입니다.
      if(body.freebusy && body.freebusy.length > 0){
        data.output.text = "Rooms are not available at the requested time. Please try again."
      }
      else{
        data.output.text = roomid + " is available. Would you confirm this reservation?"
      }

      resolved(data);
    })
  });
}

/**
 * Make reservation
 * @param  {Object} data : response object
 * @param  {Object} action
 */
let confirmReservation = (data, action) =>{

  // context에서 필요한 값을 추출합니다.
  let date = action.dates;
  let startTime = action.times[0].value;
  let endTime = action.times[1]?action.times[1].value:undefined;

  // user 정보는 action 정보에 담겨있지 않으므로 data에서 추출합니다.
  let user = data.context.user;

  let startTimestamp = new moment(date+"T"+startTime+"+0900");
  let endTimestamp = new moment(startTimestamp).hours(startTimestamp.hours() + 1);
  if(endTime){
    endTimestamp = new moment(date+" "+endTime);
  }

  // 편의를 위해 site, room, purpose 및 attendees 정보는 하드코딩되어있습니다.
  let reqOption = {
    method : 'POST',
    url : process.env.RBS_URL + '/book',
    headers : {
      'Accept': 'application/json',
      'Content-Type': 'application/json' //'application/x-www-form-urlencoded'
    },
    json : {
      "roomid": 'room1/camomile',
      "start" : startTimestamp.valueOf(),
      "end" : endTimestamp.valueOf(),
      "purpose": "quick review",
      "attendees": 5,
      "user" : {
        "userid": user.id
      }
    }
  };

  return new Promise((resolved, rejected) => {
    request(reqOption, (err, res, body) => {
      data.context.action = {};
      console.log(reqOption, body);
      if(err || res.statusCode > 300){
        data.output.text = "Your reservation is not successful. Please try again."
        resolved(data);
      }
      resolved(data);
    })
  });
}

/** 
 * 사용자의 회의실 예약 리스트를 가져오는 함수
 * @param  {Object} data : response object
 * @param  {Object} action 
 */ 
let checkReservation = (data, action) => {
  // context에서 필요한 값을 추출합니다.
  let date = action.dates;
  let startTime, endTime;
  if(action.times){
    startTime = action.times[0]?action.times[0].value:undefined;
    endTime = action.times[1]?action.times[1].value:undefined;
  }

  // 날짜 값과 시간 값을 조합하여 시작 시간과 종료 시간을 Timestamp 형태로 변환합니다. 편의를 위해 종료 시간이 따로 명시되지 않는 경우 시작 시간에서 1개월 후로 설정하도록 합니다.
  let startTimestamp = new moment();
  if(startTime){
    startTimestamp = new moment(date+"T"+startTime+"+0900");
  }
  let endTimestamp = new moment(startTimestamp).month(startTimestamp.month() + 1);
  if(endTime){
    endTimestamp = new moment(date+" "+endTime);
  }

  // /book/search/byuser API는 site id, user id, start time, end time을 Query parameter로 받아 해당 시간에 사용자의 예약 리스트를 return해주는 api입니다.
  let reqOption = {
    method : 'GET',
    url : process.env.RBS_URL + '/book/search/byuser',
    headers : {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    qs : {
    "siteid" : "camomile",
    "userid" : data.context.user.id,
    "start" : startTimestamp.valueOf(),
    "end" : endTimestamp.valueOf()
    }
  };
  
  return new Promise((resolved, rejected) => {
    request(reqOption, (err, res, body) => {
      data.context.action = {};
      if(err){
        rejected(err);
      }
      body = JSON.parse(body);
      // body 의 length가 0보다 크면 기존에 예약정보가 있다는 의미입니다.
      if(body && body.length > 0){
        let resvs = [];
        let index = 0;
        for(let resv of body){
          //예약 목록을 사용자가 볼 수 있는 형태로 변환하여 resvs 변수에 저장합니다.
          resvs.push((++index) + ": " + moment(resv.start).utcOffset('+0900').format(config.dateTimeFormat) + " ~ " + moment(resv.end).utcOffset('+0900').format(config.dateTimeFormat) + ", " + resv.roomid + ", " + resv.purpose);
        }
        //예약 목록을 Context에 저장합니다.
        data.context.reservations = body;
        //사용자에게 보여줄 예약 목록은 Output에 저장합니다.
        data.output.text = resvs;
      }
      else{
        data.output.text = ["Your reservation is not found."];
      }
      resolved(data);
    })
  });
}

let checkNextReservation = (data, action) => {
  return checkReservation(data, action).then(data => {
    if(data.output.text && Array.isArray(data.output.text)) data.output.text = data.output.text[0];
    return data
  });
}

/** 
 * 회의실 취소
 * @param  {Object} data : response object
 * @param  {Object} action 
 */ 
let confirmCancellation = (data, action) => {
  // user 정보는 action 정보에 담겨있지 않으므로 data에서 추출합니다.
  let user = data.context.user;
  let eventId = data.context.eventid;
  let reservations = data.context.reservations;
  let index = data.context.removeIndex;

  let reqOption = {
    method : 'DELETE',
    url : process.env.RBS_URL + '/book',
    headers : {
      'Accept': 'text/plain',//'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    qs : {
      "eventid" : reservations[index].id,
      "userid" : user.id,
      "roomid" : reservations[index].roomid
    }
  };

  return new Promise((resolved, rejected) => {
    request(reqOption, (err, res, body) => {
      data.context.action = {};
      if (res.statusCode >= 300) {
        data.output.text = "Your request is not successful. Please try again."
      }
      resolved(data);
    })
  });
}

module.exports = {
    'initialize': (app, options) => {
        app.post('/api/message', postMessage);
    },
    'getConversationResponse' : getConversationResponse
};