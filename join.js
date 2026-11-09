'use strict';
const destination=new URL('player.html',location.href);destination.hash=location.hash;location.replace(destination.href);
