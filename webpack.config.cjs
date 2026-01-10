const path = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    plugins: [
        new MiniCssExtractPlugin({ filename: '[name]/main.css' }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src/themes/*/**/*.{png,jpg,jpeg,gif,webp,svg,ico}',
                    to({ absoluteFilename }) {
                        // src/themes/<theme>/... → <theme>/...
                        const rel = absoluteFilename.replace(/.*[\\/]src[\\/]themes[\\/]/, '');
                        const [theme, ...rest] = rel.split(/[\\/]/);
                        return `${theme}/${rest.join('/')}`;
                    },
                    noErrorOnMissing: true
                }
            ]
        })
    ],
    entry: {
        nbn24: './src/themes/nbn24/main.ts',
        xalior: './src/themes/xalior/main.ts',
        robotic: './src/themes/robotic/main.ts'
    },
    output: {
        filename: '[name]/main.js',
        path: path.resolve(__dirname, 'public/themes')
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devServer: {
        static: path.resolve(__dirname, 'public'),
        port: 8080,
        hot: true
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true
                    }
                },
                exclude: /node_modules/
            },
            {
                test: /\.(svg|png|jpe?g|gif|webp|ico)$/i,
                parser: {
                    dataUrlCondition: { maxSize: 4 * 1024 } // inline if <= 4KB
                },
                type: 'asset/resource',
                generator: {
                    filename: (pathData) => {
                        const mod = pathData.module;
                        const resource = mod?.resource || mod?.rootModule?.resource || '';
                        const m = resource.match(/[\\/]src[\\/]themes[\\/]([^\\/]+)[\\/]/);
                        const theme = m ? m[1] : 'assets';
                        return `${theme}/icons/[contenthash][ext][query]`;
                    }
                }
            },
            {
                test: /\.(scss)$/,
                use: [
                    {
                        // Extracts CSS for each JS file that includes CSS
                        loader: MiniCssExtractPlugin.loader
                    },
                    {
                        loader: 'css-loader'
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: () => [
                                    require('autoprefixer')
                                ]
                            }
                        }
                    },
                    {
                        loader: 'sass-loader'
                    }
                ]
            }
        ]
    }
}
