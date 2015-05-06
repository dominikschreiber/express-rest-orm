var express = require('express')
  , app = express()
  , Sequelize = require('sequelize')
  , orm = new Sequelize('example', 'root', '', {
  	    host: 'localhost',
  	    dialect: 'sqlite',
  	    pool: {
  	    	max: 5,
  	    	min: 0,
  	    	idle: 10000
  	    },
  	    storage: __dirname + '/db.sqlite'
    })

  , User = orm.define('user', {
  		givenname: {
  			type: Sequelize.STRING
  		},
  		lastname: {
  			type: Sequelize.STRING
  		}
    });

User.sync({force: true}).then(function() {
	return User.create({
		givenname: 'Dominik',
		lastname: 'Schreiber'
	});
});

app.use('/api', require('../index')([User]));

app.listen(1337);