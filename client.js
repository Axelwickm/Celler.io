/*  Modified work Copyright 2017 Axel Wickman and Patrik Olsson
    MIT Licensed.
*/
/*  Original work Copyright 2012-2016 Sven "underscorediscovery" Bergström
    
    written by : http://underscorediscovery.ca
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    MIT Licensed.
*/

    //A window global for our game root variable.
var game = {};

    //When loading, we store references to our
    //drawing canvases, and initiate a game instance.
window.onload = function(){

        //Create our game client instance.
    game = new game_core();

            //Fetch the viewport
        game.viewport = document.getElementById('viewport');
        window.onresize = function(){
            //Adjust their size
            game.viewport.width = window.innerWidth;
            game.viewport.height = window.innerHeight;
            game.camera.updateViewport();
        }
        game.viewport.width = window.innerWidth;;
        game.viewport.height = window.innerHeight;
            
        

            //Fetch the rendering contexts
        game.ctx = game.viewport.getContext('2d');

        game.create_camera();

            //Set the draw style for the font
        game.ctx.font = '11px "Helvetica"';

        //Finally, start the loop
    game.update( new Date().getTime() );

};