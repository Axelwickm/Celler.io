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
var debugging = false;

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
		
		$('#cellInfo')
			.sidebar({
				closable:false,
				dimPage:false
			})
			.sidebar('setting', 'transition', 'overlay');
			
		$('#debuggingInfo')
			.sidebar({
				closable:false,
				dimPage:false
			})
			.sidebar('setting', 'transition', 'overlay');

        //Finally, start the loop
    game.update( new Date().getTime() );

};

var updateCellInfo = function (matter){
	matter = Matter.sortByMass(matter);
	$("#cell_mass").text(matter.mass);
	$("#cell_temperature").text(Math.round(matter.temperature*10)/10);
	$("#cell_enthalpy").text(Math.round(matter.averageEnthalpy));
	$("#cell_charge").text(Math.round(matter.averageFreeBonds));
	
	$("#matter_list").empty();
	for (var i = 0; i<matter.matter.length; i++){
		var compound = matter.matter[i];
		var c = $("#matter_item").clone()
			.css("display", "inline")
			.attr("id","compound_"+i);
		c.find(".header").text(Matter.iform_to_text(compound.iform));
		c.find(".compound_count").text(compound.count);
		c.find(".compound_mass").text(Math.round(compound.mass/matter.mass*1000)/1000);
		
		c.appendTo("#matter_list");
	}
}

var updateDebugging = function(){
	debugging = $("#debugging").is(":checked");
	console.log("Debugging "+debugging);
	
	if (debugging) $('#debuggingInfo').sidebar('show');
	else		   $('#debuggingInfo').sidebar('hide');
}

var updateDebuggingInfo = function(){
	$("#debug_fps").text(Math.round(game.fps_avg*10)/10);
	$("#debug_ping").text(game.net_ping);
	$("#debug_cells").text(game.gs.cells.length);
	$("#debug_players").text(game.gs.players.length);
}