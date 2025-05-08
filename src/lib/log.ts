import * as RotatingFileStream from "rotating-file-stream";

// Define verbose flag with a default value
const verbose: boolean = process.env.VERBOSE === 'true' || false;

const pad = (num: number): string => (num > 9 ? "" : "0") + num;

const filename_generator = (time: number | Date, index?: number): string => {
    if (!time) return "log/nbn-oidc-provider.log";

    if (typeof time === "number") time = new Date(time);

    const month = time.getFullYear() + "" + pad(time.getMonth() + 1);
    const day = pad(time.getDate());
    const hour = pad(time.getHours());
    const minute = pad(time.getMinutes());

    return `log/${month}${day}-${hour}${minute}-${index}-nbn-oidc-provider.log`;
};

export const logstream = RotatingFileStream.createStream(filename_generator, {
    size: "10M", // rotate every 10 MegaBytes written
    interval: "7d", // rotate daily
    compress: "gzip" // compress rotated files
});

export const log = (msg: string): void => {
    logstream.write(msg);
    if (verbose) console.log(msg);
}

export const errorstream = RotatingFileStream.createStream(filename_generator, {
    size: "10M", // rotate every 10 MegaBytes written
    interval: "7d", // rotate daily
    compress: "gzip" // compress rotated files
});

export const error = (msg: string): void => {
    errorstream.write(msg);
    if(verbose) console.error(msg);
}