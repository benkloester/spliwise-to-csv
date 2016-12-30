var express = require('express'),
  sys = require('sys'),
  oauth = require('oauth'),
  session = require('express-session'),
  json2csv = require('json2csv'),
  app = express(),
  consumerKey = "XH19fg88X4s6zYXDA0EZGLBW9TxCvlb2auqrMDrw",
  consumerSecret = "CDSVYWIRYJ24gWWBbdQAMpyf0Yo6dfEKVD247V0C",
  fieldsToConvert = [
    'Description', 'Amount', 'Date', 'Category', 
    'Group', 'Currency'
  ],
  thisUser = {},
  readyJson = [],
  groupsIdMap = {};

function consumer() {
  return new oauth.OAuth(
    "https://secure.splitwise.com/api/v3.0/get_request_token", "https://secure.splitwise.com/api/v3.0/get_access_token", 
    consumerKey, consumerSecret, "1.0", "https://splitwise-csv.herokuapp.com/sessions/callback", "HMAC-SHA1");   
}

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}));

app.get('/', function(req, res){
  res.send('Hello World');
});

app.get('/sessions/connect', function(req, res){
  consumer().getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
    if (error) {
      res.send("Error getting OAuth request token : " + sys.inspect(error), 500);
    } else {
      req.session.oauthRequestToken = oauthToken,
      req.session.oauthRequestTokenSecret = oauthTokenSecret;
      res.redirect("https://secure.splitwise.com/authorize?oauth_token="+req.session.oauthRequestToken);      
    }
  });
});

app.get('/sessions/callback', function(req, res){
  consumer().getOAuthAccessToken(req.session.oauthRequestToken, req.session.oauthRequestTokenSecret, req.query.oauth_verifier, function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
    if (error) {
      res.send("Error getting OAuth access token : " + sys.inspect(error) + "["+req.session.oauthAccessToken+"]"+ "["+req.session.oauthAccessTokenSecret+"]"+ "["+sys.inspect(results)+"]", 500);
    } else {
      req.session.oauthAccessToken = oauthAccessToken;
      req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;

      // Get current user id
      consumer().get("https://secure.splitwise.com/api/v3.0/get_current_user", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function (error, data, response) {
        if (error) {
          res.send("Error getting data : " + sys.inspect(error), 500);
        } else {
            thisUser = JSON.parse(data).user;
        }  
      }); 

      // Get groups for this user
      consumer().get("https://secure.splitwise.com/api/v3.0/get_groups", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function (error, data, response) {
        if (error) {
          res.send("Error getting data : " + sys.inspect(error), 500);
        } else {
          // res.send(data);
            groups = JSON.parse(data).groups;
            groups.forEach(function(group) {
              groupsIdMap[group.id] = group.name;
            })
        }  
      }); 

      // Get data only for this user and save to readyJson
      consumer().get("https://secure.splitwise.com/api/v3.0/get_expenses?limit=0", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function (error, data, response) {
        if (error) {
          res.send("Error getting data : " + sys.inspect(error), 500);
        } else {
          // res.send(data);
          var jsonData = JSON.parse(data),
              expenses = jsonData.expenses;

          expenses.forEach(function(expense){
              if (typeof expense.deleted_at === 'undefined') {
                  return;
              }
              var users = expense.users,
              involved = false,
              userExpense;
              users.forEach(function(user){
                 if (thisUser.id === user.user.id) {
                    involved = true;
                    userExpense = user;
                    return;
                 }
              });

              // ignore expenses current user is not involved in
              if (!involved) {
                return;
              }

              var thisExpense = {};
              if(expense.group_id === null) {
                expense.group_id = 0;
              }
              thisExpense.Group = groupsIdMap[expense.group_id],
              thisExpense.Description = expense.description,
              thisExpense.Currency = expense.currency_code;
              thisExpense.Amount = userExpense.owed_share;
              thisExpense.Category = expense.category.name;
              thisExpense.Date = expense.date;
              readyJson.push(thisExpense);
          });

        json2csv({data: readyJson, fields: fieldsToConvert}, function(err, csv) {
            if (err) console.log(err);
                console.log(csv);
                res.header('content-type','text/csv');
                res.header('content-disposition', 'attachment; filename=report.csv');
                res.send(200,csv);
            });
        }  
      });
    }
  });
});

app.listen(process.env.PORT || 3000, function(){
  console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
});
