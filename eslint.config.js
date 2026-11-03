module.exports = [
    {
        files: ['Shikimori.js'],
        languageOptions: {
            ecmaVersion: 5,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                Lampa: 'readonly',
                Navigator: 'readonly',
                YT: 'readonly',
                $: 'readonly',
                jQuery: 'readonly',
                module: 'readonly',
                encodeURIComponent: 'readonly',
                parseInt: 'readonly',
                parseFloat: 'readonly',
                isNaN: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'no-redeclare': 'error',
            'no-unreachable': 'error',
            'eqeqeq': ['error', 'always']
        }
    },
    {
        files: ['test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                global: 'readonly',
                require: 'readonly',
                module: 'readonly',
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
        }
    }
]
