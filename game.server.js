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
        PythonShell = require('python-shell'),
        verbose     = true;

    //Since we are sharing code with the browser, we
    //are going to include some values to handle that.
    global.window = global.document = global;

    //Import shared game library code.
    require('./game.core.js');
    
    // Getting the python server script
    game_server.python_process = new PythonShell('./game.py',{mode:'json'});
    console.log('Python process started');
    
    // Logging all prints in python file
    game_server.python_process.on('message', function (message) {
        if (message.event == 'print')
            console.log('Python process: '+message.data);
        else if (message.event == 'ongameupdate')
            console.log('Python process gameupdate recieved');
    });
    game_server.python_process.on('error', function (err) {
        if(err) throw err;
    });
    
    game_server.local_time = 0;
    game_server._dt = new Date().getTime();
    game_server._dte = new Date().getTime();

    setInterval(function(){
        game_server._dt = new Date().getTime() - game_server._dte;
        game_server._dte = new Date().getTime();
        game_server.local_time += game_server._dt/1000.0;
    }, 4);

    game_server.onMessage = function(client, message) {

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

    };
    

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

    };

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
 
        //set this flag, so that the update loop can run it.
        this.game.active = true;
        
        //return it
        return this.game;

    };

        //we are requesting to kill a game in progress.
    game_server.endGame = function(userid) {

        if(this.game) {
            //stop the game updates
            this.game.gamecore.stop_update();
            
            for (var i = 0; i<this.game.gamecore.players.length; i++){
                this.game.gamecore.players[i].send('s.e');
            }
            
            game_server.python_process.end(function (err) {
                // killing python process
                if (err) throw err;
                    console.log('Python process killed');
            });

        } else {
            this.log('The game was not found!');
        }

    };

    game_server.newPlayer = function(client) {
        this.game.gamecore.server_new_player(client);
        this.game.player_count++;
    } 
    
    game_server.playerLeave = function(client){
        this.game.gamecore.server_player_leave(client);
        this.game.player_count--;
    }
    
    game_server.onClientInputs = function(client, inputs){
        this.game.gamecore.server_handle_client_inputs(client, inputs);
    };

