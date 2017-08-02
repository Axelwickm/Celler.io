/*  Modified work Copyright 2017 Axel Wickman and Patrik Olsson
    MIT Licensed.
*/
/*  Original work Copyright 2012-2016 Sven "underscorediscovery" Bergström
    
    written by : http://underscorediscovery.ca
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    MIT Licensed.
*/

//The main update loop runs on requestAnimationFrame,
//Which falls back to a setTimeout loop on the server
//Code below is from Three.js, and sourced from links below

    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

    // requestAnimationFrame polyfill by Erik Möller
    // fixes from Paul Irish and Tino Zijdel


var frame_time = 1/60; // run the local game at 16ms/ 60hz
if('undefined' != typeof(global)) frame_time = 1/22; //on server we run at 45ms, 22hz
var physics_frame = 1000/80; // physics updates at 80 Hz
var physics_timestep = 1/80; // physics steps 41
var server_physics_update_every = 50; // Incudes physics updates every 50th update

( function () {

    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
        window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
        window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }

    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = function ( callback, element ) {
            var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
            var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if ( !window.cancelAnimationFrame ) {
        window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    }

}() );

        //Now the main game class. This gets created on
        //both server and client. Server creates one for
        //each game that is hosted, and client creates one
        //for itself to play the game.
        

/* The game_core class */

if('undefined' != typeof(global)) var p2 = require('p2');
var game_core = function(game_instance){

    //Store the instance, if any
    this.instance = game_instance;
    //If instance exists, this is server
    this.server = this.instance !== undefined;
    
    
    console.log('Is server: '+this.server);
    

    //Used in collision etc.
    this.world = {
        width : 1000,
        height : 500
    };
    

    //Set up some physics integration values
    this._pdt = 0.0001;                 //The physics update delta time
    this._pdte = new Date().getTime();  //The physics update last delta time
    //A local timer for precision on server and client
    this.local_time = 0.016;            //The local timer
    this._dt = new Date().getTime();    //The local timer delta
    this._dte = new Date().getTime();   //The local timer last frame time

    //Start a physics loop, this is separate to the rendering
    //as this happens at a fixed frequency
    this.create_physics_simulation();
    
    this.gs = new game_state(this);

    //Start a fast paced timer for measuring time easier
    this.create_timer();

    //Client specific initialisation
    if(!this.server) {
        this.selectedCell = -1;

        //Create a keyboard handler
        this.keyboard = new THREEx.KeyboardState();

        //Create the default configuration settings
        this.client_create_configuration();
        //A list of recent server updates we interpolate across
        //This is the buffer that is the driving factor for our networking
        this.server_updates = [];

        //Connect to the socket.io server!
        this.client_connect_to_server();

        //We start pinging the server to determine latency
        this.client_create_ping_timer();
        
        //Create debug gui
        this.client_create_debug_gui();
        
    }
    else {
        this.server_time = 0;
        this.server_updates = 0;
        
        // Add some test cells to the gamestate
    
        for (var i = 0; i<100; i++){
            var random_compounds = [];
            var compound_count = Math.random()*6+1;
            for (var j = 0; j<compound_count; j++){
                var iform = [];
                var iform_count = Math.random()*3+1;
                for (var n = 0; n<iform_count; n++){
                    iform.push(Math.floor(Math.random()*4+1));
                    iform.push(Math.floor(Math.random()*24));
                }
                random_compounds.push(Matter.create(iform, Math.floor(Math.random()*10+1)));
                
            }
            
            this.gs.add(new Cell(this, {
                p_pos:[this.world.width*Math.random(),this.world.height*Math.random()],
                p_vel:[500*Math.random()-250,500*Math.random()-250],
                compounds:random_compounds
            }));
        };
    }

};

//server side we set the 'game_core' class to a global type, so that it can use it anywhere.
if( 'undefined' != typeof global ) module.exports = global.game_core = game_core;


/*
    The gamestate class
    Contains the actuall game data and logs the changes made to it 
*/
var game_state = function(gamecore){
    this.gamecore = gamecore;
    this.server = gamecore.server;
    this.client_initial = true;
    this.deletions = [];
    
    this.cells = [];
    this.players = [];
}

game_state.prototype.add = function(obj){
    this[obj.type].push(obj);
    if (this.server){
        obj.update = {e:'add',data:[]};
        for (var prop in obj){
            if (obj.hasOwnProperty(prop)){
                obj.update.data.push(prop);
            }
        }
    }   
}

game_state.prototype.erase = function(obj){
    var index = this[obj.type].indexOf(obj);
    this[obj.type].splice(index, 1);
    if (this.server){
        this.deletions.push({type:obj.type, index:index});
    }
}

game_state.prototype.edit = function(obj, p, v){
    if (v)
        obj[p] = v;
    // 'add' takes priority over 'edit'
    if (this.server && (obj.update.e.length == 0 || obj.update.e == 'edit')){
        obj.update.e = 'edit';
        obj.update.data.push(p);
    }
}

game_state.prototype.server_get_changes = function(simulation_status, all_data){ 
    var blacklist = ['update', 'body', 'instance', 'gs'];
    var changes = [];
    
    // Loop through both cells and players
    for (var i = 0; i < this.cells.length + this.players.length; i++){
        var obj;
        if (i < this.cells.length)
            obj = this.cells[i];
        else
            obj = this.players[i % this.cells.length];
        // The change variable of this object
        var change = {};
        if (all_data){
            for (var prop in obj){
                // Skip if property is blacklisted
                if (blacklist.indexOf(prop) != -1 || !obj.hasOwnProperty(prop)) continue;
                change[prop] = obj[prop];
            }
        }
        else {
            for (var j = 0; j<obj.update.data.length; j++){ // Loop through changed properties
                // Skip if property is blacklisted
                if (blacklist.indexOf(obj.update.data[j]) != -1) continue; 
                // Add the changed property with value to this change 
                change[obj.update.data[j]] = obj[obj.update.data[j]];
            }
        }
        // Adding simulation data which is otherwise hidden in body member
        if (simulation_status && obj.body){
            change.p_pos = obj.body.position;
            change.p_ang = obj.body.angle;
            change.p_vel = obj.body.velocity;
            change.p_angvel = obj.body.angularVelocity;
            
            change.matter = obj.matter;
        }
        //Push the type of action made
        change.e = obj.update.e;
        change.type = obj.type;
        change.update_id = i % this.cells.length;
        if (3<Object.keys(change).length && change.e == '' && !all_data) change.e = 'edit';
        // Push change to changes array
        if (change.e != '' || all_data)
            changes.push(change);
        // Remove update data
        obj.update.e = '';
        obj.update.data = [];
    }
    var to_send = {
        c:changes,
        d:this.deletions
    }
    this.deletions = [];
    // Return in object wrapper
    return to_send; 
}

game_state.prototype.client_load_changes = function(data){
    for (var i = 0; i < data.d.length; i++){
        var object = data.d[i];
        this[object.type].splice([object.index], 1);
    }
    
    var player_i = 0;
    for (var i = 0; i < data.c.length; i++){
        var change = data.c[i];
        if (change.type == 'cells'){
            if (change.e == 'add' || this.client_initial) this.add(new Cell(this.gamecore, change));
            else if (change.e == 'edit') {
                for (var prop in change){
                    if (prop != 'e' && prop.substring(0,2) == 'p_') {
                        if (prop == 'p_pos')         this.cells[change.update_id].body['position'] = change[prop];
                        else if (prop == 'p_ang')    this.cells[change.update_id].body['angle'] = change[prop];
                        else if (prop == 'p_vel')    this.cells[change.update_id].body['velocity'] = change[prop];
                        else if (prop == 'p_angvel') this.cells[change.update_id].body['angularVelocity'] = change[prop];
                        else if (prop == 'p_radius') this.cells[change.update_id].body.shapes[0].radius = change[prop];
                    }
                    else if (prop != 'e' ) this.cells[change.update_id][prop] = change[prop];
                }
            }
        }
        else if (change.type == 'players'){
            if (change.e == 'add' || this.client_initial) this.add(new Player(this.gamecore, change));
            else if (change.e == 'edit'){
                for (var prop in change){
                    if (prop != 'e' ) this.players[change.update_id][prop] = change[prop];
                }
            }
        }
    }
    
    
    this.client_initial = false;
}

/* The Player class */

var Player = function(client){
    this.type = 'players';
    this.instance = client;
    this.userid = client.userid;
}

/*
    Gameplay classes
*/


/* Matter class which does all the chemistry, mass and temperature calculations */
// TODO: Properly calculate reaction count
var Matter = function(compounds, temperature){
    this.matter = compounds || [];
    this.temperature = temperature || 0;
    this.updatePhysicalProperties();
}
// Representative letters for elements
Matter.E_letters = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'],
// Number of possible bonds for elements
Matter.E_bonds   = [ -4, -3, -2, -1, 1 , 2 , 3 , 4 , -4, -3, -2, -1, 1 , 2 , 3 , 4 , -4, -3, -2, -1, 1 , 2 , 3 , 4 ],

Matter.prototype.add = function(newCompound){
    // Push the new compund if not all of it has been consumed
    if (newCompound.count != 0) {
        var compound = matter.find(function(e){
            return (newCompound.length == e.iform.length) && newCompound.every(function(element, index) {
                return element === e.iform[index]; 
            });
        });
        
        if (compound)
            compound.count += newCompound.count;
        else 
            matter.push(newCompound);
    }   
    
    this.updatePhysicalProperties();
}

Matter.prototype.random_reaction = function(){
    // React the compunds, which decreases their count, while returning a list of the new formed compunds
    var a = this.matter[Math.floor(Math.random()*this.matter.length)];
    var b = this.matter[Math.floor(Math.random()*this.matter.length)];
    
    // Exit if same compunds were selected
    if (a != b){
        var reaction = Matter.react(a, b, this.temperature);
        
        // Update the temperature depending on the energy released
        this.temperature += reaction.energy*(a.mass+b.mass)/(this.mass*100);
        
        // Add the products to the matter
        for (var i = 0; i < reaction.products.length; i++){
            // Add product to matter if it doesn't exist, else add to the count
            var product_iform = reaction.products[i].iform;
            var compound = this.matter.find(function(e){
                return (product_iform.length == e.iform.length) && product_iform.every(function(element, index) {
                    return element === e.iform[index]; 
                });
            });
            
            if (compound)
                compound.count += reaction.products[i].count;
            else
                this.matter.push(reaction.products[i]);
        }
        
        // Delete a or b if they have been depleted
        if (a.count == 0) {
            var index = this.matter.indexOf(a);
            if (index != -1) this.matter.splice(index, 1);
        }
        
        if (b.count == 0) {
            var index = this.matter.indexOf(b);
            if (index != -1) this.matter.splice(index, 1);
        }
    }
}

Matter.react = function(a, b, temperature){
    var products = [];
    var energy = 0;
    
    // Randomly move elements from a -> b 
    var changes = Math.ceil(Math.random() * (a.length-1) );

    var aiform = a.iform.slice();
    var biform = b.iform.slice();
    for (var i = 0; i<changes; i++){
        // Move set (amount, element) from a.iform to b.iform
        
        // Choose which element to move
        var n = Math.floor( Math.random() * aiform.length/2) * 2;
        // Choose how much of it to move
        var q = Math.floor( Math.random() * aiform[n]);
        if (q == 0) q = 1;
        
        // See if this element already exists in b
        var elementInB = -1;
        for (var j = 0; j<biform.length; j+=2){
            if (biform[j+1] == aiform[n+1]){
                elementInB = j;
                break;
            } 
        }
        
        if (elementInB == -1){
            // Add element to b
            biform.push(q);
            biform.push(aiform[n+1]);
        }
        else {
            // Add quantity to element in b
            biform[elementInB] += q;
        }
        
        // Remove q of element from a
        aiform[n] -= q;
        // Remove element if it's below 0
        if (aiform[n] <= 0)
            aiform.splice(n, 2);
    }
    
    // See if this reaction makes gibbs free energy < 0
    var newA = Matter.create(aiform, a.count);
    var newB = Matter.create(biform, b.count);
    
    // Calculate deltaH
    var deltaH = a.enthalpy + b.enthalpy - newA.enthalpy - newB.enthalpy;
    var deltaS = newA.entropy + newB.entropy - a.entropy - b.entropy;
    var deltaG = deltaH - temperature*deltaS;
    
    //Check if reaction is sponaneus, which means it will happen
    if (deltaG < 0){
        // TODO: find most limited reactant
        // This determines reaction rate
        var reactionCount = Math.floor( Math.min(a.count, b.count) );
        reactionCount = 1;
        
        a.count -= reactionCount;
        b.count -= reactionCount;
        newA.count = reactionCount;
        newB.count = reactionCount;
        if (newA.iform.length != 0)
            products.push(newA);
        if (newB.iform.length != 0)
            products.push(newB);
        
        energy -= deltaH * reactionCount;
        
        newA.iform = Matter.sortIform(newA.iform);
        newB.iform = Matter.sortIform(newB.iform);
        
    }
    

    return {
        products : products,
        energy : energy
    };
}

Matter.create = function(iform, count){
    count = count || 1;
    
    // if iform is a string it is turned into a numberarray
    if (typeof iform === 'string'){
        iform = iform.split(',');
        iform.forEach(function(e, i){
            iform[i] = parseInt(e);
        });
    }
    iform = Matter.sortIform(iform);
    
    var free_bonds = 0;
    var enthalpy = 0;
    var entropy = 0;
    var mass = 0;
    
    for (var i = 0; i < iform.length ; i+=2){
        free_bonds += Matter.E_bonds[iform[i+1]]*iform[i];
        mass += (iform[i+1]+1)*iform[i];
        entropy += iform[i];
    }
    entropy += mass;
    
    for (var i = 0; i < iform.length ; i+=2){
        enthalpy +=
            Math.abs(free_bonds - Matter.E_bonds[iform[i+1]])
            * 0.666*Math.pow(iform[i], 1.5);
    }

    return {
        iform:iform,
        length:iform.length/2,
        count:count,
        free_bonds:free_bonds,
        enthalpy:enthalpy,
        entropy:entropy,
        mass:mass
    }
}

Matter.prototype.updatePhysicalProperties = function(){
    this.mass = 0;
    this.averageEnthalpy = 0;
    this.averageFreeBonds = 0;
    for (var i = 0; i<this.matter.length; i++){
        this.mass += this.matter[i].mass*this.matter[i].count;
        this.averageEnthalpy += this.matter[i].enthalpy;
        this.averageFreeBonds += this.matter[i].free_bonds;
    }
    this.averageFreeBonds /= this.matter.length;
    this.averageEnthalpy /= this.matter.length;
    
    var color = 'hsl(350, '+(100-this.averageEnthalpy*.1+10)+'%, '+(this.temperature*.75+50)+'%)';
    
    return {
        mass:this.mass,
        color:color
    }
}

Matter.sortIform = function(iform){
    var c = [];
    for (var i = 0; i < iform.length; i+=2){
        c.push({
            e: iform[i+1],
            c: iform[i]
        });
    };
    
    c.sort(function(a, b){
        return b.e < a.e;
    });
    
    iform = [];
    c.forEach(function(e){
        iform.push(e.c);
        iform.push(e.e);
    });
    return iform;
}

Matter.prototype.sortByMass = function() {
    // Sort iforms
    for (var i = 0; i < this.matter.length; i++){
        Matter.sortIform(this.matter[i].iform);
    }
    
    // Sort by mass
    return this.matter.sort(function(a, b){
        return a.count*a.mass < b.count*b.mass;
    });
}

Matter.prototype.sortAlphabetically = function(){
    // Sort iforms
    for (var i = 0; i < this.matter.length; i++){
        this.matter[i].iform = Matter.sortIform(this.matter[i].iform);
    }
    
    // Sort matter depending on iform
    this.matter.sort(function(a, b){
        for (var i = 0; i < Math.max(a.iform.length, b.iform.length); i += 2){
            if (!a.iform[i+1] && b.iform[i+1]) return false;
            if (!b.iform[i+1] && a.iform[i+1]) return true;
            if ( a.iform[i+1] != b.iform[i+1]) return a.iform[i+1] < b.iform[i+1];
        }
        return b.mass < a.mass;
    });
}

Matter.prototype.log = function(){
    for (var i = 0; i < this.matter.length; i++){
        console.log(this.matter[i].count+'  '+Matter.iform_to_text(this.matter[i].iform));
    }
}

Matter.iform_to_text = function(iform){
    var tform = '';
    for (var c in iform){
        if (c%2 == 1)
            tform = tform.concat( this.E_letters[iform[c]] );
        else
            tform = tform.concat( (c == 0 ? '':'_' ) + iform[c]);
    }
    return tform;
}


var Cell = function(gamecore, options){
    this.type = options.type || 'cells';
    this.gs = gamecore.gs;
    
    if (options.matter)
        this.matter = new Matter(options.matter.matter, 1);
    else 
        this.matter = new Matter(options.compounds, 1);

    var physicalProperies = this.matter.updatePhysicalProperties();
    this.color = physicalProperies.color;
    
    this.body = new p2.Body({
        mass: this.matter.mass/1000,
        position: options.p_pos,
        angle: options.p_angle || 0,
        velocity: options.p_vel || [0,0],
        angularVelocity: options.p_angvel || 0,
        damping:0.00
    });
    
    var circleShape = new p2.Circle({ radius: Math.sqrt(0.4*this.matter.mass/Math.PI) });
    this.body.addShape(circleShape);
    
    gamecore.physics.addBody(this.body);
}

Cell.prototype.updt = function(isServer){
    if (Math.random() < 0.05*Math.sqrt(this.matter.temperature) && isServer){
        this.matter.random_reaction();
        var physicalProperies = this.matter.updatePhysicalProperties();
        this.gs.edit(this, 'matter');
        this.gs.edit(this, 'color', physicalProperies.color);
        this.gs.edit(this, 'p_mass', this.matter.mass/1000);
        this.body.shapes[0].radius = Math.sqrt(0.4*this.matter.mass/Math.PI);
        this.gs.edit(this, 'p_radius', this.body.shapes[0].radius);
    }
    this.matter.temperature *= 0.9995;
}

Cell.prototype.draw = function(){
    game.ctx.fillStyle = this.color;
    game.ctx.beginPath();
    game.ctx.arc( this.body.position[0], this.body.position[1], this.body.shapes[0].radius, 0, Math.PI * 2 );
    game.ctx.fill();
}


/*
    Helper functions for the game code

        Here we have some common maths and game related code to make working with 2d vectors easy,
        as well as some helpers for rounding numbers to fixed point.

*/

    // (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
    //copies a 2d vector like object from one to another
game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
    //Add a 2d vector with another one and return the resulting vector
game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
    //Subtract a 2d vector with another one and return the resulting vector
game_core.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
    //Multiply a 2d vector with a scalar value and return the resulting vector
game_core.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
    //For the server, we need to cancel the setTimeout that the polyfill creates
game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
    //Simple linear interpolation
game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
    //Simple linear interpolation between 2 vectors
game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };


/*

 Common functions
 
    These functions are shared between client and server, and are generic
    for the game state. The client functions are client_* and server functions
    are server_* so these have no prefix.

*/

    //Main update loop
game_core.prototype.update = function(t) {
    
        //Work out the delta time
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016
    
    for (var i = 0; i<this.gs.cells.length; i++){
        this.gs.cells[i].updt(this.server);
    }

        //Store the last frame time
    this.lastframetime = t;
    if (this.gs.cells.length != 0 && false)
        console.log(this.gs.cells[0].matter.mass);

        //Update the game specifics
    if(this.server) {
        this.server_update();
    } else {
        this.client_update();
    }

        //schedule the next update
    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );

};


/*
    Shared between server and client.
    In this example, `item` is always of type game_player.
*/


game_core.prototype.update_physics = function() {
    this.physics.step(physics_timestep);

    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }
    
};

/*

 Server side functions
 
    These functions below are specific to the server side only,
    and usually start with server_* to make things clearer.

*/

    //Updated at 15ms , simulates the world state
game_core.prototype.server_update_physics = function() {
    
};

//Makes sure things run smoothly and notifies clients of changes
//on the server side
game_core.prototype.server_update = function(){

    //Update the state of our local clock to match the timer
    this.server_time = this.local_time;
    this.server_updates++;

    //Make a snapshot of the current state, for updating the clients
    var gamestate_change;
    if (this.server_updates%server_physics_update_every == 0)
        gamestate_change = this.gs.server_get_changes(true, false);
    else
        gamestate_change = this.gs.server_get_changes(false, false);
    
    gamestate_change.t = this.server_time;
    
    for (var i = 0; i<this.gs.players.length; i++){
        this.gs.players[i].instance.emit( 'onserverupdate', gamestate_change);
    }

};

game_core.prototype.server_new_player = function(client){
    var player = new Player(client);
    this.gs.add(player);
    
    var gamestate_to_client = this.gs.server_get_changes(true, true);
    gamestate_to_client.t = this.server_time;
    gamestate_to_client.playerIndex = this.gs.players.length-1;
    
    player.instance.emit('onserverupdate', gamestate_to_client);
    
    console.log('Player connected - ID: '+player.userid);
};

game_core.prototype.server_player_leave = function(client){
    var index = null;
    for (var i = 0; i < this.gs.players.length; i++){
        if (this.gs.players[i].userid == client.userid){
            index = i;
            break;
        }
    }
    console.log('Player left - ID: '+this.gs.players[index].userid);
    this.gs.erase(this.gs.players[index]);
    
};

game_core.prototype.server_handle_client_inputs = function(client, inputs){
    for (var i in inputs){
        var action = inputs[i].action;
        if (action == 'click cell'){
            if (this.gs.cells[inputs[i].cellID].color == '#ff0000')
                this.gs.edit(this.gs.cells[inputs[i].cellID], 'color', '#0000ff');
            else
                this.gs.edit(this.gs.cells[inputs[i].cellID], 'color', '#ff0000');
        }
    }
};

game_core.prototype.handle_server_input = function(client, input, input_time, input_seq) {
    //Fetch which client this refers to
    var player = null;
    for (var i = 0; i<this.gs.players.length; i++){
        if (client.userid == this.gs.players[i].instance.userid){
            player = this.gs.players[i];
            break;
        }
    }
    
    if (!player)
        console.error('Player with client.userid '+client.userid+', could not be found on server handle input.');

};


/*

 Client side functions

    These functions below are specific to the client side only,
    and usually start with client_* to make things clearer.

*/

game_core.prototype.client_click_cell = function(cellID){
    this.me.inputs.push({
        action:'click cell',
        cellID:cellID
    });
    this.selectedCell = cellID;
};


game_core.prototype.client_update_physics = function() {
    
};

game_core.prototype.client_update = function() {
    //Clear the screen area
    this.ctx.clearRect(0,0,this.viewport.width,this.viewport.height);
    
    this.camera.begin();
    
    for (var i = 0; i<this.gs.cells.length; i++)
        this.gs.cells[i].draw();
    
    this.camera.end();


    //Capture inputs from the player
    this.client_handle_input();

    //Work out the fps average
    this.client_refresh_fps();
    
    if (this.selectedCell != -1 ) console.log(this.gs.cells[this.selectedCell].matter);

};

game_core.prototype.create_timer = function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
} 

game_core.prototype.create_physics_simulation = function() {
    this.physics = new p2.World({gravity:[0,0]});
    this.physics.defaultContactMaterial.friction = 0.5;
    this.physics.defaultContactMaterial.stiffness = 800;
    this.physics.defaultContactMaterial.restitution = 1;
    
    // World boundaries
    this.physics.boundaries = new p2.Body({position:[this.world.width/2,this.world.height]});
    this.physics.boundaries.addShape(new p2.Line({length:this.world.width}));
    this.physics.addBody(this.physics.boundaries);
    this.physics.boundaries = new p2.Body({position:[this.world.width/2,0]});
    this.physics.boundaries.addShape(new p2.Line({length:this.world.width}));
    this.physics.addBody(this.physics.boundaries);
    this.physics.boundaries = new p2.Body({position:[0,this.world.height/2],angle:Math.PI/2});
    this.physics.boundaries.addShape(new p2.Line({length:this.world.height}));
    this.physics.addBody(this.physics.boundaries);
    this.physics.boundaries = new p2.Body({position:[this.world.width,this.world.height/2],angle:Math.PI/2});
    this.physics.boundaries.addShape(new p2.Line({length:this.world.height}));
    this.physics.addBody(this.physics.boundaries);
    
    setInterval(function(){
        this._pdt = (new Date().getTime() - this._pdte)/1000.0;
        this._pdte = new Date().getTime();
        this.update_physics();  
    }.bind(this), physics_frame);

};


game_core.prototype.create_camera = function() {
    this.camera = new Camera(this.ctx);
    this.camera.zoomTo(2000);
    this.camera.moveTo(this.world.width/2, this.world.height/2);
    
    this.viewport.onmousemove = function(e){
        e = e || window.event;
        game.oldMouse.x = game.mouseX;
        game.oldMouse.y = game.mouseY;
        game.mouseX = e.offsetX;
        game.mouseY = e.offsetY;
        
        if (game.dragging != -1){
            var oldScreen = game.camera.screenToWorld(game.mouseX, game.mouseY);
            var newScreen = game.camera.screenToWorld(game.oldMouse.x, game.oldMouse.y);
            game.camera.moveTo(game.camera.lookat[0]+newScreen.x-oldScreen.x, game.camera.lookat[1]+newScreen.y-oldScreen.y);
        }
    };
    
    this.viewport.onclick = function(e){
        e = e || window.event;
        var worldCoords = game.camera.screenToWorld(event.offsetX, event.offsetY);
        var clicked_cell_bodies = game.physics.hitTest([worldCoords.x, worldCoords.y], game.physics.bodies);
        
        if (clicked_cell_bodies.length != 0){
            for(var i = 0; i<game.gs.cells.length; i++)
                if (game.gs.cells[i].body == clicked_cell_bodies[0]){
                    game.client_click_cell(i);
                    break;
                }   
        }
            
    };
    
    this.viewport.onmousedown = function(e){
        e = e || window.event;
        if (event.button == 0) {
            game.dragging = 0;
            game.viewport.style.cursor = 'move';
        }
    };
    this.viewport.onmouseup = function(e){
        e = e || window.event;
        if (event.button == 0) {
            game.dragging = -1;
            game.viewport.style.cursor = "default";
        }
    };
    
    this.viewport.onmouseleave = function(e){
        e = e || window.event;
        game.dragging = -1;
        game.viewport.style.cursor = "default";
    };
    
    
    scrollHandler = function(e){
        var e = window.event || e;
        var delta = -Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
    
        var oldPos = game.camera.screenToWorld(game.mouseX, game.mouseY);
        game.camera.zoomTo(Math.max(game.camera.distance+delta*100*Math.sqrt(game.camera.distance/1000), 25));
        var newPos = game.camera.screenToWorld(game.mouseX, game.mouseY);
        game.camera.moveTo(game.camera.lookat[0]+oldPos.x-newPos.x, game.camera.lookat[1]+oldPos.y-newPos.y);
    };
    this.viewport.addEventListener("mousewheel", scrollHandler, false);    // IE9, Chrome, Safari, Opera
    this.viewport.addEventListener("DOMMouseScroll", scrollHandler, false);// Firefox
    this.viewport.addEventListener("onmousewheel", scrollHandler, false);  // IE 6/7/8
};


game_core.prototype.client_create_configuration = function() {

    this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
    this.net_ping = 0.001;              //The round trip time from here to the server,and back
    this.last_ping_time = 0.001;        //The time we last sent a ping


    this.net_offset = 100;              //100 ms latency between server and client interpolation for other clients
    this.buffer_size = 2;               //The size of the server history to keep for rewinding/interpolating.
    this.target_time = 0.01;            //the time where we want to be in the server timeline
    this.oldest_tick = 0.01;            //the last time tick we have available in the buffer

    this.client_time = 0.01;            //Our local 'clock' based on server time - client interpolation(net_offset).
    this.server_time = 0.01;            //The time the server reported it was at, last we heard from it
    
    this.dt = 0.016;                    //The time that the last frame took to run
    this.fps = 0;                       //The current instantaneous fps (1/this.dt)
    this.fps_avg_count = 0;             //The number of samples we have taken for fps_avg
    this.fps_avg = 0;                   //The current average fps displayed in the debug UI
    this.fps_avg_acc = 0;               //The accumulation of the last avgcount fps samples

    this.lit = 0;
    this.llt = new Date().getTime();
    
    this.mouseX = 0;
    this.mouseY = 0;
    this.oldMouse = {x:0, y:0}
    this.dragging = -1;

};

game_core.prototype.client_create_debug_gui = function() {

    this.gui = new dat.GUI();

    var _playersettings = this.gui.addFolder('Your settings');
    
    var _debugsettings = this.gui.addFolder('Debug view');
        
        _debugsettings.add(this, 'fps_avg').listen();
        _debugsettings.add(this, 'local_time').listen();
        _debugsettings.add(this, 'mouseX').listen();
        _debugsettings.add(this, 'mouseY').listen();

        _debugsettings.open();

    var _consettings = this.gui.addFolder('Connection');
        _consettings.add(this, 'net_latency').step(0.001).listen();
        _consettings.add(this, 'net_ping').step(0.001).listen();

        _consettings.open();

};

game_core.prototype.client_refresh_fps = function() {

        //We store the fps for 10 frames, by adding it to this accumulator
    this.fps = 1/this.dt;
    this.fps_avg_acc += this.fps;
    this.fps_avg_count++;

        //When we reach 10 frames we work out the average fps
    if(this.fps_avg_count >= 10) {

        this.fps_avg = this.fps_avg_acc/10;
        this.fps_avg_count = 1;
        this.fps_avg_acc = this.fps;

    } //reached 10 frames

};


game_core.prototype.client_handle_input = function(){

    //This takes input from the client and keeps a record,
    //It also sends the input information to the server immediately
    //as it is pressed. It also tags each input with a sequence number.
    
    if (game.dragging != -1)
        game.dragging++;
    
    if (this.me){
        if (this.me.inputs)
            this.socket.emit('input', this.me.inputs );
        this.me.inputs = [];
    }
};

/* 
    Client Net Code
*/

game_core.prototype.client_onserverupdate_recieved = function(data){
        
    // Store the server time (this is offset by the latency in the network, by the time we get it)
    this.server_time = data.t;
    this.local_time = data.t+this.net_latency;
    
    //  Update our local offset time from the last server update
    this.client_time = this.server_time - (this.net_offset/1000);
    
    // Load the data into gamestate
    this.gs.client_load_changes(data);
    
    // Register certain player as "me" if a playerIndex is given, which it is on connect
    if (data.playerIndex != undefined){
        this.me = this.gs.players[data.playerIndex];
        this.me.inputs = [];
    }
};


game_core.prototype.client_connect_to_server = function() {
        
        //Store a local reference to our connection to the server
        this.socket = io.connect();

        //When we connect, we are not 'connected' until we have a server id
        //and are placed in a game by the server. The server sends us a message for that.
        this.socket.on('connect', function(){}.bind(this));

        //Sent when we are disconnected (network, server down, etc)
        this.socket.on('disconnect', this.client_ondisconnect.bind(this));
        //Sent each tick of the server simulation. This is our authoritive update
        this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
        //On error we just show that we are not connected for now. Can print the data.
        this.socket.on('error', this.client_ondisconnect.bind(this));
        //On message from the server, we parse the commands and send it to the handlers
        this.socket.on('message', this.client_onnetmessage.bind(this));

};

game_core.prototype.client_create_ping_timer = function() {

    //Set a ping timer to 1 second, to maintain the ping/latency between
    //client and server and calculated roughly how our connection is doing

    setInterval(function(){

        this.last_ping_time = new Date().getTime();
        this.socket.send('p.' + (this.last_ping_time) );

    }.bind(this), 1000);
    
};


game_core.prototype.client_onping = function(data) {

    this.net_ping = new Date().getTime() - parseFloat( data );
    this.net_latency = this.net_ping/2;

};

game_core.prototype.client_onnetmessage = function(data) {

    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
        case 's': //server message

            switch(subcommand) {

                case 'e' : //end game requested
                    this.client_ondisconnect(commanddata); break;

                case 'p' : //server ping
                    this.client_onping(commanddata); break;


            } //subcommand

        break; //'s'
    } //command
                
};

game_core.prototype.client_ondisconnect = function(data) {
    console.log('Server disconnect');
};
