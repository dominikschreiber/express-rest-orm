'use strict';

module.exports = function(grunt) {
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        // ===== clean ========================================================
        clean: 'dist/',

        // ===== validate =====================================================
        jshint: {
            files: 'src/**/*.js',
            options: {
                jshintrc: './.jshintrc'
            }
        },

        // ===== compile ======================================================

        babel: {
            files: {
                expand: true,
                cwd: 'src/',
                src: '**/*.js',
                dest: 'dist/',
                ext: '.js'
            },
            options: {
                sourceMap: true
            }
        },

        // ===== test =========================================================

        mochaTest: {
            test: {
                src: 'dist/test/**/*.js',
                options: {
                    reporter: 'spec'
                }
            }
        }
        // "test": "multi='spec=- travis-cov=-' ./node_modules/.bin/mocha --require blanket --timeout 4000 --reporter mocha-multi",
    });

    grunt.registerTask('validate', ['clean', 'jshint']);

    grunt.registerTask('compile', ['validate', 'babel']);

    grunt.registerTask('test', ['compile', 'mochaTest']);

    grunt.registerTask('install', ['test']);

    grunt.registerTask('default', ['install']);
};