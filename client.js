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

var commands = ['click cell, selected','toggle pause','cell delete, selected',
				'cell split, selected','cell merge next, selected','cell add temp, selected, temp=0',
				'cell speed, selected, times=1'];

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
		
		var suggested = [];
		var autoComplete = -1;
			
		var prevCommandList = [];
		var stepBack = 0;
		
		var getSuggestions = function(){
			if ($("#sendCommand").is(":focus")){
				// Come up with suggestions
				suggested = [];
				commands.forEach(function(e){
					if (e.includes($("#sendCommand").val())) suggested.push(e);
				})
				$("#searchSuggestions").empty();
				for (var i = 0; i<suggested.length && i<8; i++){
					if (i == autoComplete)
						$("#searchSuggestions").append("<a style='color:#AAA;'>"+suggested[i]+"</a><br>");
					else
						$("#searchSuggestions").append("<a style='color:#444455;'>"+suggested[i]+"</a><br>");
				}
			}
		}
		
		$("#sendCommand").keydown(function(event) {
			if (autoComplete != -1 && event.which == 13){
				$("#sendCommand").val(suggested[autoComplete]);
				autoComplete = -1;
			}
			else if (event.which == 13 && $("#sendCommand").val() != "") {
				if (prevCommandList[prevCommandList.length-1] != $("#sendCommand").val()) prevCommandList.push($("#sendCommand").val());
				stepBack = 0;
				
				var commandString = $("#sendCommand").val().split(",");
				var command = {	action:commandString[0] };
				commandString.slice(1).forEach(function(param){
					var propVal = $.trim(param).split('=');
					if (typeof propVal[1] != 'undefined'){
						if ($.isNumeric(propVal[1]))
							propVal[1] = parseFloat(propVal[1]);
						command[propVal[0]] = propVal[1];
					}
					else command[propVal[0]] = true;
					
				});
				if (typeof command['selected'] != 'undefined' && game.selectedCell != -1)
					command.cellID = game.selectedCell;
				
				console.log("Sending command to server: "+JSON.stringify(command));
				game.client_action(command);
				
				$("#sendCommand").val("");
			}
			else if (event.which == 40 && event.ctrlKey == true && suggested.length != 0){
				console.log(autoComplete);
				autoComplete = (autoComplete+2)%(suggested.length+1)-1;
			}
			else if (event.which == 38){
				if (prevCommandList[prevCommandList.length - stepBack -1]){
					stepBack++;
					$("#sendCommand").val(prevCommandList[prevCommandList.length - stepBack]);
				}
			}
			else if (event.which == 40){
				if (stepBack != 0){
					stepBack--;
					$("#sendCommand").val(prevCommandList[prevCommandList.length - stepBack]);
				}
			}
			getSuggestions();
		});
		

		$("#sendCommand").on('input',function(e){
			getSuggestions();
		});
		
		$("#sendCommand").focusout(function(){
			$("#searchSuggestions").empty();
			autoComplete = -1;
		});
		
		updateDebugging();

        //Finally, start the loop
    game.update( new Date().getTime() );

};



var cellSelected = function(){
	$('#cellInfo').sidebar('show');
	$('.cellSelect').removeClass('disabled');
}

var cellDeselected = function(){
	$('#cellInfo').sidebar('hide');
	$('.cellSelect').addClass('disabled');
	
}

var updateCellInfo = function (matter){
	$("#cell_mass").text(matter.mass);
	$("#cell_temperature").text(matter.temperature.toPrecision(3));
	$("#cell_enthalpy").text(Math.round(matter.averageEnthalpy));
	$("#cell_charge").text(Math.round(matter.averageFreeBonds));
	
	matter.matter.sort(function(a, b){
        return a.count*a.mass < b.count*b.mass;
    });
	
	$("#matter_list").empty();
	for (var i = 0; i<matter.matter.length; i++){
		var compound = matter.matter[i];
		var c = $("#matter_item").clone()
			.css("display", "inline")
			.attr("id","compound_"+i);
		c.find(".header").text(Matter.iform_to_text(compound.iform));
		c.find(".compound_count").text(compound.count);
		c.find(".compound_mass").text((compound.count*compound.mass/matter.mass).toPrecision(3));
		
		c.appendTo("#matter_list");
	}
}

var updateDebugging = function(){
	debugging = $("#debugging").is(":checked");
	console.log("Debugging "+debugging);
	
	if (debugging){
		$('#debuggingInfo').sidebar('show');
		$('.debug').show();
	}
	else {
		$('#debuggingInfo').sidebar('hide');
		$('.debug').hide();
	}
}

var updateDebuggingInfo = function(){
	$("#debug_fps").text(game.fps_avg.toPrecision(3));
	$("#debug_ping").text(game.net_ping);
	$("#debug_client_time").text(game.client_time.toPrecision(3));
	$("#debug_cells").text(game.gs.cells.length);
	$("#debug_players").text(game.gs.players.length);
}

var togglePause = function(){
	if (game.gs.common[0].paused){
		$("#pauseButton").text("Pause");
		$("#pauseButton").addClass("blue");
		$("#pauseButton").removeClass("red");
	}
	else {
		$("#pauseButton").text("Unpause");
		$("#pauseButton").addClass("red");
		$("#pauseButton").removeClass("blue");
	}
		
	game.client_debug_togglePause();
}

var splitSelected = function(){
	game.client_debug_split_cell(game.selectedCell);
}