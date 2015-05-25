'use strict';

module.exports = function(grunt) {
    [
        'grunt-contrib-clean',
        'grunt-contrib-jshint',
        'grunt-babel',
        'grunt-mocha-istanbul',
    ].forEach(function(task) {
        grunt.loadNpmTasks(task);
    });

    // ######### task configuration ###########################################

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

        mocha_istanbul: {
            coverage: {
                src: 'dist/test',
                options: {
                    mask: '**/*.js'
                }
            },
            coveralls: {
                src: 'dist/test',
                options: {
                    coverage: true,
                    check: {
                        lines: 100,
                        statements: 100
                    },
                    root: 'dist/main',
                    reportFormats: ['cobertura', 'lcovonly']
                }
            },
            istanbul_check_coverage: {
                default: {
                    options: {
                        coverageFolder: 'coverage',
                        check: {
                            lines: 100,
                            statements: 100
                        }
                    }
                }
            }
        }
    });

    // ######### events #######################################################

    grunt.event.on('coverage', function(lcovFileContents, done) {
        require('coveralls').handleInput(lcovFileContents, function(err) {
            if (err) { return done(err); }
            done();
        });
    });

    // ######### tasks/lifecycle ##############################################

    grunt.registerTask('validate', ['clean', 'jshint']);

    grunt.registerTask('compile', ['validate', 'babel']);

    grunt.registerTask('test', ['compile', 'mocha_istanbul:coverage']);

    grunt.registerTask('install', ['test']);

    grunt.registerTask('default', ['install']);

    // for travis build
    grunt.registerTask('travis', ['compile', 'mocha_istanbul:coveralls']);
};