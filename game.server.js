/*  Modified work Copyright 2017 Axel Wickman and Patrik Olsson
    MIT Licensed.
*/
/*  Original work Copyright 2012-2016 Sven "underscorediscovery" Bergström
    
    written by : http://underscorediscovery.ca
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    MIT Licensed.
*/

    var
        game_server = module.exports = { game : null },
        UUID        = require('node-uuid'),
        verbose     = true;

        //Since we are sharing code with the browser, we
        //are going to include some values to handle that.
    global.window = global.document = global;

        //Import shared game library code.
    require('./game.core.js');

        //A simple wrapper for logging so we can toggle it,
        //and augment it for clarity.
    game_server.log = function() {
        if(verbose) console.log.apply(this,arguments);
    };

    game_server.local_time = 0;
    game_server._dt = new Date().getTime();
    game_server._dte = new Date().getTime();

    setInterval(function(){
        game_server._dt = new Date().getTime() - game_server._dte;
        game_server._dte = new Date().getTime();
        game_server.local_time += game_server._dt/1000.0;
    }, 4);

    game_server.onMessage = function(client,message) {

            //Cut the message up into sub components
        var message_parts = message.split('.');
            //The first is always the type of message
        var message_type = message_parts[0];

        if(message_type == 'i') {
                //Input handler will forward this
            this.onInput(client, message_parts);
        } else if(message_type == 'p') {
            client.send('s.p.' + message_parts[1]);
        }

    }; //game_server.onMessage

    game_server.onInput = function(client, parts) {
            //The input commands come in like u-l,
            //so we split them up into separate commands,
            //and then update the players
        var input_commands = parts[1].split('-');
        var input_time = parts[2].replace('-','.');
        var input_seq = parts[3];

            //the client should be in a game, so
            //we can tell that game to handle the input
        if(client && client.game && client.game.gamecore) {
            client.game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
        }

    }; //game_server.onInput

        //Define some required functions
    game_server.createGame = function() {
		console.log('Creating game.');

         //Create new game
        this.game = {};
			
		this.game.player_count = 0;
		
		//Create a new game core instance, this actually runs the
        //game code like collisions and such.
        this.game.gamecore = new game_core( this.game );
        //Start updating the game loop on the server
        this.game.gamecore.update( new Date().getTime() );
		
		
		
		//game.player_client.send('s.j.' + game.player_host.userid);
        //game.player_client.game = game;

            //now we tell both that the game is ready to start
            //clients will reset their positions in this case.
        //game.player_client.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
        //game.player_host.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
 
            //set this flag, so that the update loop can run it.
        this.game.active = true;
		

        //return it
        return this.game;

    }; //game_server.createGame

        //we are requesting to kill a game in progress.
    game_server.endGame = function(userid) {

        if(this.game) {
            //stop the game updates
            this.game.gamecore.stop_update();
			
			for (var i = 0; i<this.game.gamecore.players.length; i++){
				this.game.gamecore.players[i].send('s.e');
			}

        } else {
            this.log('The game was not found!');
        }

    }; //game_server.endGame

	game_server.newPlayer = function(client) {
		this.game.gamecore.server_new_player(client);
		this.game.player_count++;
	} //game_server.newPlayer
	
	game_server.playerLeave = function(client){
		this.game.gamecore.server_player_leave(client);
		this.game.player_count--;
	} //game_server.playerLeave

