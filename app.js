var util = require('util');
var restclient = require('restler');
const axios = require('axios');
const async = require('async');

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');


// mongoose.Promise = global.Promise;
// mongoose.connect('mongodb://root:1234Pizza@cluster0-shard-00-00-hhef0.mongodb.net:27017,cluster0-shard-00-01-hhef0.mongodb.net:27017,cluster0-shard-00-02-hhef0.mongodb.net:27017/test?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin', {useMongoClient: true}, (err) => {
//     if (!err) {
//         console.log('connected to db');
//     } else {
//         console.log('connection to db failed');
//         throw err;
//     }
// });

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var fxml_url = 'http://flightxml.flightaware.com/json/FlightXML2/';
var username = 'patrickedelen';
var apiKey = '*';


// restclient.get(fxml_url + 'MetarEx', {
//     username: username,
//     password: apiKey,
//     query: {airport: 'KAUS', howMany: 1}
// }).on('success', function(result, response) {
//     // util.puts(util.inspect(result, true, null));
//     var entry = result.MetarExResult.metar[0];
//     util.puts('The temperature at ' + entry.airport + ' is ' + entry.temp_air + 'C');
// });

// restclient.get(fxml_url + 'Enroute', {
//     username: username,
//     password: apiKey,
//     query: {airport: 'KIAH', howMany: 10, filter: '', offset: 0}
// }).on('success', function(result, response) {
//     util.puts('Aircraft en route to KIAH:');
//     //util.puts(util.inspect(result, true, null));
//     var flights = result.EnrouteResult.enroute;
//     for (i in flights) {
//       var flight = flights[i];
//       //util.puts(util.inspect(flight));
//       util.puts(flight.ident + ' (' + flight.aircrafttype + ')\t' + 
//           flight.originName + ' (' + flight.origin + ')');
//     }
// });

// flight ID: CLX779@1516302600
// restclient.get(fxml_url + 'DecodeFlightRoute', {
//     username: username,
//     password: apiKey,
//     query: {faFlightID: 'CLX779@1516302600'}
// }).on('success', function(result, response) {
//     util.puts('Aircraft en route to KIAH:');
//     //util.puts(util.inspect(result, true, null));
//     if (results) {
//         console.log(results);
//     }
// });

app.get('/api/flightsearch/:airline/:flightNum', (req, res) => {
    let airline = req.params.airline;
    let flightNo = req.params.flightNum;

restclient.get(fxml_url + 'AirlineFlightSchedules', {
    username: username,
    password: apiKey,
    query: {
        startDate: '1517122399',
        endDate:   '1517208799',
        airline: airline,
        flightno: flightNo
        }
}).on('success', function(result, response) {

    const flights = result.AirlineFlightSchedulesResult.data;
    let flight = flights[0];

    console.log(result);

    if (result.AirlineFlightSchedulesResult.data.length > 0) {
        let flId = flight.ident + '@' + flight.departuretime
        restclient.get(fxml_url + 'DecodeFlightRoute', {
            username: username,
            password: apiKey,
            query: {faFlightID: flId}
        }).on('success', function(route, response) {
            if (route) {
                let pairs = [];
                let points = route.DecodeFlightRouteResult.data;
                for (let i = 0; i < (points.length - 1); i ++) {
                    let pArr = [];
                    pArr[0] = points[i].latitude;
                    pArr[1] = points[i].longitude;
                    pArr[2] = points[i + 1].latitude;
                    pArr[3] = points[i + 1].longitude;

                    pairs.push(pArr);
                }

                let d = getDistanceArr(pairs);
                let sPerKm = (flight.arrivaltime - flight.departuretime)/d;
                let startTime = flight.departuretime;

                let infoPoints = [];
                let curTime = 0;

                async.eachOfLimit(points, 1, function (pt, i, cb) {
                    if (i < (points.length - 1)) {
                        let pObj = {
                            latitude: points[i].latitude,
                            longitude: points[i].longitude,
                            waypoint: points[i].name,
                            name: 'City',
                            fact: 'Something fun',
                            endTime: 0
                        };

                        let ptDis = getDistance(points[i].latitude, points[i].longitude, points[i + 1].latitude, points[i + 1].longitude);
                        let t = (sPerKm * ptDis);
                        
                        pObj.endTime = startTime + curTime + t;
                        curTime += t;

                        let pagesUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' + points[i].latitude + '%7C' + points[i].longitude + '&gsradius=10000&gslimit=10&format=json'
                        axios.get(pagesUrl)
                        .then((pages) => {
                            if (pages.data.query.geosearch.length > 0) {
                                let wikiId = pages.data.query.geosearch[0].pageid;
                                let singleUrl = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&pageids=' + wikiId;
                                axios.get(singleUrl)
                                .then((page) => {
                                    if (page.data.query) {
                                        pObj.name = page.data.query.pages[wikiId].title;
                                        pObj.fact = page.data.query.pages[wikiId].extract;
                                        
                                        infoPoints.push(pObj);
                                        cb();
                                    } else {
                                        throw new Error('page not found')
                                    }
                                })
                            } else {
                                throw new Error('page not found')
                            }
                        })
                        .catch((err) => {
                            pObj.name = 'No articles found';
                            pObj.fact = 'No articles found';
                            infoPoints.push(pObj);
                            cb();
                        });
                    } else {
                        cb();
                    }
                }, function (err) {
                    console.log(infoPoints);
                    res.json({id: flId, depTime: startTime, arrTime: flight.arrivaltime, points: infoPoints});
                });

            }
        });
    } else {
        res.json({err: 'Flight not found, check your airline ID and flight number'});
    }
});
});
app.get('/api/test', (req, res) => {
    res.json({msg: 'hi'});
})

// restclient.get(fxml_url + 'AirlineFlightSchedules', {
//     username: username,
//     password: apiKey,
//     query: {
//         startDate: '1517122399',
//         endDate:   '1517208799',
//         airline: 'AA',
//         flightno: '1'
//         }
// }).on('success', function(result, response) {
//     util.puts('Aircraft en route to KIAH:');
//     //util.puts(util.inspect(result, true, null));

//     const flights = result.AirlineFlightSchedulesResult.data;
//     let flight = flights[0];

//     console.log(result);

//     if (result) {
//         let flId = flight.ident + '@' + flight.departuretime
//         restclient.get(fxml_url + 'DecodeFlightRoute', {
//             username: username,
//             password: apiKey,
//             query: {faFlightID: flId}
//         }).on('success', function(route, response) {
//             util.puts('Aircraft route:');
//             //util.puts(util.inspect(route, true, null));
//             if (route) {
//                 let pairs = [];
//                 let points = route.DecodeFlightRouteResult.data;
//                 for (let i = 0; i < (points.length - 1); i ++) {
//                     let pArr = [];
//                     pArr[0] = points[i].latitude;
//                     pArr[1] = points[i].longitude;
//                     pArr[2] = points[i + 1].latitude;
//                     pArr[3] = points[i + 1].longitude;

//                     pairs.push(pArr);
//                 }

//                 let d = getDistanceArr(pairs);
//                 let sPerKm = (flight.arrivaltime - flight.departuretime)/d;
//                 let startTime = flight.departuretime;

//                 let infoPoints = [];
//                 let curTime = 0;

//                 async.eachOfLimit(points, 1, function (pt, i, cb) {
//                     if (i < (points.length - 1)) {
//                         let pObj = {
//                             latitude: points[i].latitude,
//                             longitude: points[i].longitude,
//                             waypoint: points[i].name,
//                             name: 'City',
//                             fact: 'Something fun',
//                             endTime: 0
//                         };

//                         let ptDis = getDistance(points[i].latitude, points[i].longitude, points[i + 1].latitude, points[i + 1].longitude);
//                         let t = (sPerKm * ptDis);
                        
//                         pObj.endTime = startTime + curTime + t;
//                         curTime += t;

//                         let pagesUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' + points[i].latitude + '%7C' + points[i].longitude + '&gsradius=10000&gslimit=10&format=json'
//                         axios.get(pagesUrl)
//                         .then((pages) => {
//                             if (pages.data.query.geosearch.length > 0) {
//                                 let wikiId = pages.data.query.geosearch[0].pageid;
//                                 let singleUrl = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&pageids=' + wikiId;
//                                 axios.get(singleUrl)
//                                 .then((page) => {
//                                     if (page.data.query) {
//                                         pObj.name = page.data.query.pages[wikiId].title;
//                                         pObj.fact = page.data.query.pages[wikiId].extract;
                                        
//                                         infoPoints.push(pObj);
//                                         cb();
//                                     } else {
//                                         throw new Error('page not found')
//                                     }
//                                 })
//                             } else {
//                                 throw new Error('page not found')
//                             }
//                         })
//                         .catch((err) => {
//                             pObj.name = 'No articles found';
//                             pObj.fact = 'No articles found';
//                             infoPoints.push(pObj);
//                             cb();
//                         });
//                     } else {
//                         cb();
//                     }
//                 }, function (err) {
//                     console.log(infoPoints);
//                 });

//             }
//         });
//     }
// });


app.listen(3000, (path) => {
    console.log('starting server...');
}); //listens on port 3000 -> http://localhost:3000/


function getDistanceArr(arrLatLon) {
    let totalDistance = 0;
    arrLatLon.forEach(pair => {
        totalDistance += getDistance(pair[0], pair[1], pair[2], pair[3]);
    });

    return totalDistance;
}

function getDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = (lat2 - lat1) * Math.PI / 180;  // deg2rad below
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = 
        0.5 - Math.cos(dLat)/2 + 
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        (1 - Math.cos(dLon))/2;

    return R * 2 * Math.asin(Math.sqrt(a));
}