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

const conversation = require('../message');
const config = require('../../util/config');
const cloudant = require('../../util/db');
const db = cloudant.db;

const token = process.env.TELEGRAM_TOKEN;
const url = process.env.PUBLIC_URL;

const TelegramBot = require('node-telegram-bot-api');
let bot = new TelegramBot(token);

let postMessage = (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
};

bot.setWebHook(`${url}/bot${token}`);

bot.on('message', msg => {
  console.log(JSON.stringify(msg))
  let user_key = msg.chat.id;
  let content = {
  	text : msg.text
  };

  db.get(user_key).then(doc => {
    conversation.getConversationResponse(content, doc.context).then(data => {
      db.insert(Object.assign(doc, {
        'context': Object.assign(data.context, {
          'timezone' : "Asia/Seoul"
        }),
      }));

      bot.sendMessage(user_key, getOutputText(data));
    }).catch(function(err){
      bot.sendMessage(user_key, JSON.stringify(err.message));
    });
  }).catch(function(err) {
    // first communication
    conversation.getConversationResponse(content, {}).then(data => {
      db.insert({
        '_id' : user_key+"", // cloudant의 doc id는 반드시 string 타입이어야 합니다.
        'user_key' : user_key+"",
        'context': data.context,
        'type' : 'telegram'
      }).then(function(){
      }).catch(function(err){
      	console.log(err)
      });
      
      bot.sendMessage(user_key, getOutputText(data));  

    }).catch(function(err){
      bot.sendMessage(user_key, JSON.stringify(err.message));
    });
    
  });
});

function getOutputText(data){
  var output = data.output;
  if(output.text && Array.isArray(output.text)){
    return output.text.join('\\n');
  }
  else if(output.text){
    return output.text;
  }
  else return "";
}

module.exports = {
    'initialize' : (app, options) => {
        app.post(`/bot${token}`, postMessage);
    }
};