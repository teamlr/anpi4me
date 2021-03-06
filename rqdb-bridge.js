var amqp = require('amqp');
var fs = require('fs');
var bunyan= require('bunyan');
var email2json = require('email2json');
var couchbase = require("couchbase");
var uuid = require('node-uuid');
var Promise = require('promise').Promise;

var rabbitqueue;
var exchangeName;
var queueName;
var connExchange_;
var connQueue_;
var routing_;
var deliveryMode;

var exchangeMapping = {};

var logger = bunyan.createLogger({name: 'email_parser',
	streams: [
    	{
      		stream: process.stdout,
      		level: "debug"
    	}
  ]
});

    var options = {};
    var confirm = true;
    var durable = true;
    var autoDelete = false;
    var exchangeType = 'direct';

        options['host'] = 'localhost';
        options['port'] = '5672';
        options['login'] = 'guest';
        options['password'] = 'guest@aws';
        queueName = 'q_calendar';
        exchangeName = 'x_calendar';
        deliveryMode = 2;

    //Create connection to the rabbitmq server
    logger.debug("About to Create connection with server");
    rabbitqueue = amqp.createConnection(options);
    //Declaring listerner on error on connection.
    rabbitqueue.on('error', function(error) {
        logger.debug("There was some error on the connection : " + error);
    });
    //Declaring listerner on close on connection.
    rabbitqueue.on('close', function(close) {
        logger.debug(" Connection is being closed : " + close);
    });


    /* Declaring the function to perform when connection is established and ready, function involves like:
     * 1. Creating or connecting to Exchange.
     * 2. Creating or connecting to Queue.
     * 3. Binding the Exchange and Queue.
     * 4. Saving some variables in global to be used while publishing message.
     */
    rabbitqueue.on('ready', function() {
        logger.debug("Connection is ready, will try making exchange");
        // Now connection is ready will try to open exchange with config data.
        rabbitqueue.exchange(exchangeName, {
            type: exchangeType,
            confirm: confirm,
            durable: durable
        }, function(connExchange) {
            logger.debug("connExchange with server " + connExchange + " autoDelete : " + autoDelete);
            //Exchange is now open, will try to open queue.
            return rabbitqueue.queue(queueName, {
                autoDelete: autoDelete,
                durable: durable
            }, function(connQueue) {
                logger.debug("connQueue with server " + connQueue);
                //Creating the Routing key to bind the queue and exchange.
                var key, routing;
                routing = "" + queueName + "Routing";
                //Will try to bind queue and exchange which was created above.
                connQueue.bind(connExchange, routing);
                key = exchangeName + queueName;
                //Save the variables for publising later.
                if (!exchangeMapping[key]) {
                    exchangeMapping[key] = [];
                }
                connExchange_ = connExchange;
                connQueue_ = connQueue;
                routing_ = routing;
                exchangeMapping[key].push({
                    exchange: connExchange_,
                    queue: connQueue_,
                    routing: routing_,
                    queueName: queueName
                });
                logger.debug("exchange: " + exchangeName + ", queue: " + queueName + " exchange : " + connExchange_ + " queue : " + connQueue_);
            
		logger.debug("Listening to new messages...");	
		connQueue_.subscribe(function(message){
			logger.debug("Message received, processing...");
			var email = message.data.toString();
			//logger.debug("email content:" + email);
			var icsjson = email2json.toicsjson(email);
			//logger.debug(JSON.stringify(icsjson));

		var docId = uuid.v4();		
		var vevent = {};
	try {
		if(icsjson.VEVENT) { // Apple calendar
			vevent = icsjson.VEVENT[0];
		}
		else if(icsjson.VCALENDAR[0].VEVENT) { //Google Calendar
			vevent = icsjson.VCALENDAR[0].VEVENT[0];
		}
		else {
			logger.error("Unable to find VEVENT object: " + JSON.stringify(icsjson));
		}
	
		docId = vevent.UID || docId; 
	}
	catch(err) {
		logger.error(err);
	}
		// Connect to Couchbase Server

		var cluster = new couchbase.Cluster('127.0.0.1:8091');
		var bucket = cluster.openBucket('ics', function(err) {
		if (err) {
        		logger.error("error: " + err);
  		}

		logger.debug("bucket opened");

    		bucket.upsert(docId, vevent, function(err, result) {
      			if (err) {
        			logger.error("error:" + err);
      		}
			logger.debug(result);
		});
        });
    });
});
});
});

