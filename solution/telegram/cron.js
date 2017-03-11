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

const schedule = require('node-schedule');
const request = require('request');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');

const cloudant = require('../../util/db');
const db = cloudant.db;
const config = require('../../util/config');

const token = process.env.TELEGRAM_TOKEN;

let bot = new TelegramBot(token);

let job = schedule.scheduleJob('50 * * * *', function(){
  console.log("I'm working :-D");

  // 1시간 이내의 예약 정보를 가져옵니다.
  let startTimestamp = new moment();
  let endTimestamp = new moment(startTimestamp).day(startTimestamp.day() + 1);
  //var endTimestamp = new moment(startTimestamp).month(startTimestamp.month() + 1);

  // /book/search/bysite API는 site id, start time, end time을 Query parameter로 받아 해당 시간의 예약 리스트를 return해주는 api입니다.
  request({
  	method : 'GET',
  	url : process.env.RBS_URL + "/book/search/bysite",
  	headers : {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    qs: {
      "siteid" : "camomile",
      "start" : startTimestamp.valueOf(),
      "end" : endTimestamp.valueOf()
    }
  }, function(err, httpResponse, body){
    body = JSON.parse(body);
  	if(err){
  		console.error(JSON.stringify(err));
  	}
  	else{
		  if(body && body.length > 0){
		    let resvs = [];
		    for(let resv of body){
          if(moment(resv.start).diff(moment(new Date()), 'minutes') < 60){
            let message = "[Meeting Alert] "+ moment(resv.start).utcOffset('+0900').format(config.dateTimeFormat) + " ~ " + moment(resv.end).utcOffset('+0900').format(config.dateTimeFormat) + ", " + resv.roomid + ", " + resv.purpose;
            let userId = resv.user.userid;

            db.view('context', 'telegram', {key: userId}).then(body => {
              if(body.total_rows > 0){
                let user_key = body.rows[0].id;
                bot.sendMessage(user_key, message);
              }
            });
          }
		    }
		  }
  	}
  });
});