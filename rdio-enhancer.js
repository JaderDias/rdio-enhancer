function codeToString(f) {
	var args = [];
	for (var i = 1; i < arguments.length; ++i) {
		args.push(JSON.stringify(arguments[i]));
	}
	return "(" + f.toString() + ")(" + args.join(",") + ");";
}

function injectedJs() {
	// Add a Fisher-Yates shuffle function to Array
	Array.prototype.shuffle = function () {
		var i = this.length, j, temp;
		if (i == 0) return;
		while (--i) {
			j = Math.floor(Math.random() * (i + 1));

			// Swap values
			temp = this[i];
			this[i] = this[j];
			this[j] = temp;
		}
	};

	// Used to store play next items
	var play_next_queue = [];

	// Build the Rdio Enhancer Class
	R.enhancer = {
		log: function(item) {
			delete console.log;
			console.log(item);
		},

		overwrite_playlist: function() {
			if(!R.Models || !R.Models.Playlist) {
				window.setTimeout(R.enhancer.overwrite_playlist, 100);
				return;
			}
			// Overwrite the playlist add function to support adding playlists to playlists
			// From core.rdio.js line 8056
			R.Models.Playlist.prototype.add = function(model) {
				var model_type = model.get("type");
				var playlist_this = this;
				if (model_type == "a" || model_type == "al" || model_type == "t" || model_type == "p") {
					var track_list = [];
					if(model_type == "a" || model_type == "al") {
						track_list = model.get("trackKeys");
					}
					else if(model_type == "t") {
						track_list = [model.get("key")];
					}
					else if(model_type == "p") {
						var models = model.get("tracks").models;
						for(var x = 0; x < models.length; x++) {
							track_list.push(models[x].attributes.source.attributes.key);
						}
					}

					if(playlist_this.has("tracks")) {
						playlist_this.get("tracks").addSource(model);
					}
					var d = {
						method: "addToPlaylist",
						content: {
							playlist: playlist_this.get("key"),
							tracks: track_list,
							extras: ["-*", "duration", "Playlist.PUBLISHED"]
						},
						success: function(a) {
							R.enhancer.show_message('Added "' + model.get("name") + '" to Playlist "' + playlist_this.get("name") + '"');
							a.result && playlist_this.set(a.result);
							a[0] && a[0].result && playlist_this.set(a[0].result);
						}
					};
					playlist_this._requestQueue.push(d);
				}
			};
		},

		overwrite_create: function() {
			if(!R.Component || !R.Component.create) {
				window.setTimeout(R.enhancer.overwrite_create, 100);
				return;
			}

			R.Component.orig_create = R.Component.create;
			R.Component.create = function(a,b,c) {
				//R.enhancer.log("Rdio Enhancer:")
				//R.enhancer.log(a);

				if(a == "App.Header") {
					// Add new event
					b.orig_events = b.events;
					b.events = function() {
						var local_events = b.orig_events.call(this);
						local_events["click .enhancer_master_menu"] = "onEnhancerMenuButtonClicked";
						return local_events;
					};

					// Inject Enhancer menu functions
					b.onEnhancerMenuButtonClicked = function(event) {
						this.enhancerMenu.open();
						R.Utils.stopEvent(event);
					};

					b.onEnhancerMenuOptionSelected = function(linkvalue, something) {
						linkvalue && (something ? window.open(linkvalue, "_blank") : R.router.navigate(linkvalue, true));
					};

					b.getEnhancerMenuOptions = new Backbone.Collection([
						{
							label: "Rdio Enhancer Settings",
							value: "",
							callback: R.enhancer.settings_dialog,
							visible: true
						},
						{
							label: "About Rdio Enhancer",
							value: "",
							callback: R.enhancer.about_dialog,
							visible: true
						}
					]);


					b.orig_onRendered = b.onRendered;
					b.onRendered = function() {
						b.orig_onRendered.call(this);
						this.$(".right_container .user_nav").append('<span class="user_nav_button enhancer_master_menu"></span>');
						var enhancer_menu_ele = this.$(".enhancer_master_menu");
						this.enhancerMenu = this.addChild(new R.Components.Menu({
							positionOverEl: enhancer_menu_ele,
							positionUnder: true,
							model: this.getEnhancerMenuOptions
						}));
						this.listen(this.enhancerMenu, "optionSelected", this.onEnhancerMenuOptionSelected);
					};
				}

				if(a == "Dialog.EditPlaylistDialog.Rdio") {
					b._getAttributes = function() {
						var parent_get_attributes = R.Components.Dialog.EditPlaylistDialog.Rdio.callSuper(this, "_getAttributes");
						if (this.model.isNew()) {
							var track_list = "",
								source_model = this.options.sourceModel;
							if (source_model) {
								var model_type = source_model.get("type");
								if(model_type == "a" || model_type == "al") {
									track_list = source_model.get("trackKeys");
								}
								else if(model_type == "t") {
									track_list = [source_model.get("key")];
								}
								else if(model_type == "p") {
									var models = source_model.get("tracks").models;
									if(models.length > 0) {
										track_list = [];
									}
									for(var x = 0; x < models.length; x++) {
										track_list.push(models[x].attributes.source.attributes.key);
									}
								}
							}
							parent_get_attributes.tracks = track_list;
						}
						return parent_get_attributes;
					}
				}
				if(a == "Dialog.EditPlaylistDialog") {
				}
				if(a == "TrackList") {

				}
				if(a == "ActionMenu") {
					b.orig_events = b.events;
					b.events = function() {
						var local_events = b.orig_events.call(this);
						local_events["click .sortpl"] = "onToggleSortMenu";
						local_events["click .enhancerextras"] = "onToggleExtrasMenu";
						return local_events;
					};

					// Re-enable add to playlist for playlists
					// I think the only reason this wasn't enabled for playlists was because
					// it wasn't implemented for Dialog.EditPlaylistDialog
					// My modification to Dialog.EditPlaylistDialog allows it.
					b.addToPlaylistItemVisible = function() {
						return true;
					};

					// Inject Sort menu functions
					b.onToggleSortMenu = function(a) {
						this.ToggleSortMenu(), R.Utils.stopEvent(a);
					};
					b.ToggleSortMenu = function(a) {
						this.enhancer_sort_menu || (this.checkIsInQueue(), this.enhancer_sort_menu = this.addChild(new
						R.Components.Menu({
							positionOverEl: this.$el.find(".sortpl"),
							defaultContext: this,
							alignFirstItem: true,
							model: new Backbone.Collection(this.getSortMenuOptions())
						})), this.listen(this.enhancer_sort_menu, "open", this.onSortMenuOpened));
						this.enhancer_sort_menu.toggle(a);
					};
					b.getSortMenuOptions = function() {
						return [{
								label: "Sort by Artist",
								value: "sortbyartist",
								callback: this.sortPlaylistbyArtist,
								visible: true
							}, {
								label: "Sort by Album",
								value: "sortbyalbum",
								callback: this.sortPlaylistbyAlbum,
								visible: true
							}, {
								label: "Sort by Song Name",
								value: "sortbysong",
								callback: this.sortPlaylistbySong,
								visible: true
							}, {
								label: "Sort by Release Date",
								value: "sortbyreleasedateasc",
								callback: this.sortPlaylistbyReleaseDate,
								visible: true
							}, {
								label: "Reverse",
								value: "reverse",
								callback: this.sortPlaylistReverse,
								visible: true
							},  {
								label: "Randomize",
								value: "randomize",
								callback: this.sortPlaylistRandom,
								visible: true
							}];
					};
					b.sortPlaylistbyArtist = function() {
						R.enhancer.getTracks(function(tracks) {
							R.enhancer.show_message("Sorted Playlist by Artist");
							R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.sort(R.enhancer.sortByArtist)));
							R.enhancer.current_playlist.render();
						});
					};
					b.sortPlaylistbyAlbum = function() {
						R.enhancer.getTracks(function(tracks) {
							R.enhancer.show_message("Sorted Playlist by Album");
							R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.sort(R.enhancer.sortByAlbum)));
							R.enhancer.current_playlist.render();
						});
					};
					b.sortPlaylistbySong = function() {
						R.enhancer.getTracks(function(tracks) {
							R.enhancer.show_message("Sorted Playlist by Song Name");
							R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.sort(R.enhancer.sortByTrackName)));
							R.enhancer.current_playlist.render();
						});
					};

					b.sortPlaylistbyReleaseDate = function() {
						R.enhancer.getTracks(function(tracks) {
							var album_keys = [];
							var results = {};
							jQuery.each(tracks, function(index, value) {
								var album_key = value.attributes.source.attributes.albumKey;
								album_keys.push(album_key);
							});
							R.Api.request({
								method: "get",
								content: {
									keys: album_keys,
									extras: ["-*", "releaseDate"]
								},
								success: function(success_data) {
									results = success_data;
									jQuery.each(tracks, function(index, track) {
										//console.debug (value.attributes.source.attributes.albumKey);
										//console.debug (success_data.result[value.attributes.source.attributes.albumKey]);
										//console.debug (success_data.result[value.attributes.source.attributes.albumKey].releaseDate);
										if (success_data.result[track.attributes.source.attributes.albumKey].releaseDate) {
											track.attributes.source.attributes.releaseDate = results.result[track.attributes.source.attributes.albumKey].releaseDate;
										}

									});
									R.enhancer.show_message("Sorted Playlist by Release Date" );
									R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.sort(R.enhancer.sortByReleaseDate)));
									R.enhancer.current_playlist.render();
								}
							});
						});
					};

					b.sortPlaylistReverse = function() {
						R.enhancer.getTracks(function(tracks) {
							R.enhancer.show_message("Reversed Playlist")
							R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.reverse()));
							R.enhancer.current_playlist.render();
						});
					}

					b.sortPlaylistRandom = function() {
						R.enhancer.getTracks(function(tracks) {
							R.enhancer.show_message("Randomized Playlist")
							R.enhancer.current_playlist.model.setPlaylistOrder(R.enhancer.getKeys(tracks.shuffle()));
							R.enhancer.current_playlist.render();
						});
					};
					// End Sort menu functions

					// Inject Extras menu functions
					b.onToggleExtrasMenu = function(a) {
						this.ToggleExtrasMenu(), R.Utils.stopEvent(a);
					};
					b.ToggleExtrasMenu = function() {
						this.enhancer_extras_menu || (this.checkIsInQueue(), this.enhancer_extras_menu = this.addChild(new
						R.Components.Menu({
							positionOverEl: this.$el.find(".enhancerextras"),
							defaultContext: this,
							alignFirstItem: true,
							model: new Backbone.Collection(this.getExtraMenuOptions())
						})), this.listen(this.enhancer_extras_menu, "open", this.onExtrasMenuOpened));
						this.enhancer_extras_menu.toggle(a);
					};
					b.getExtraMenuOptions = function() {
						var submenu = [{
								label: "Export to CSV",
								value: "exporttocsv",
								callback: this.exportToCSV,
								visible: true
							}, {
								label: "Fork Playlist",
								value: "forkplaylist",
								callback: this.forkPlaylist,
								visible: true
							}, {
								label: "About Rdio Enhancer",
								value: "aboutrdioenhancer",
								callback: R.enhancer.about_dialog,
								visible: true
							}
						];

						if (R.enhancer.current_playlist.model.canEdit()) {
							submenu.unshift ({
								label: "Remove Duplicates",
								value: "removeduplicates",
								callback: this.removeDuplicates,
								visible: true
							});
						}
						return submenu;
					};
					b.removeDuplicates = function() {
						R.enhancer.getTracks(function(tracks) {
							var playlist_key = R.enhancer.current_playlist.model.get("key");
							// This is a bit hackish, but the API doesn't work well.
							// The removeFromPlaylist function is based more on the index and count than the tracklist
							// So order matters!!
							// First we sort the playlist to unique tracks first and then duplicate tracks last.
							// Then just chop off all the duplicate tracks.
							// This way we only need one call to removeFromPlaylist to remove all the duplicates.
							var unique_tracks = [];
							var duplicate_tracks = [];
							jQuery.each(tracks, function(index, value) {
								var track_key = value.attributes.source.attributes.key;
								if(jQuery.inArray(track_key, unique_tracks) === -1) {
									unique_tracks.push(track_key);
								}
								else {
									duplicate_tracks.push(track_key);
								}
							});
							if(duplicate_tracks.length > 0) {
								R.enhancer.show_message('Removing Duplicates from "' + R.enhancer.current_playlist.model.get("name") + '"');
								R.enhancer.sortPlaylist(playlist_key, unique_tracks.concat(duplicate_tracks), function(status) {
									if (status.result) {
										R.Api.request({
											method: "removeFromPlaylist",
											content: {
												playlist: playlist_key,
												index: unique_tracks.length,
												count: duplicate_tracks.length,
												tracks: duplicate_tracks,
												extras: ["-*", "duration", "Playlist.PUBLISHED"]
											},
											success: function(success_data) {
												R.enhancer.current_playlist.render();
											}
										});
									}
								});
							}
							else {
								R.enhancer.show_message('There are no duplicates to remove "' + R.enhancer.current_playlist.model.get("name") + '"');
							}
						});
					};

					b.exportToCSV = function() {
						R.enhancer.getTracks(function(tracks) {
							var csv = [["Name", "Artist", "Album", "Track Number"].join(",")];
							var keys = ["name", "artist", "album", "trackNum"];
							jQuery.each(tracks, function(index, track) {
								var values = [];
								jQuery.each(keys, function(index, key) {
									values.push(track.attributes.source.attributes[key]);
								});

								csv.push('"' + values.join('","') + '"');
							});

							var pom = document.createElement('a');
							pom.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join("\n")));
							pom.setAttribute('download', R.enhancer.current_playlist.model.get("name") + '.csv');
							pom.click();
						});
					};
					b.forkPlaylist = function() {
						R.loader.load(["Dialog.EditPlaylistDialog.Rdio"], function() {
							var editor =new R.Components.Dialog.EditPlaylistDialog.Rdio({
								sourceModel: R.enhancer.current_playlist.model,
								isNew: true
							});
							editor.open()
						});
					};

					b.orig_getMenuOptions = b.getMenuOptions;
					b.getMenuOptions = function() {

						var options = b.orig_getMenuOptions.call(this);

						var tags = [];
						_.each(R.enhancer.getTagsForAlbum(this.model.get("albumKey")), _.bind(function(tag) {
							tags.push({
								label: tag,
								value: tag,
								maxWidth: 150,
								context: a,
								useTitle: true,
								hasDelete: true,
								deleteTooltip: "Remove from tags",
								callback: _.bind(this.onRemoveFromTags, this, tag)
							});
						}, this));

						tags = new Backbone.Collection(tags);

						options.push({
							label: "Tags",
							value: "tags",
							visible: this.manageTagsVisible,
							value: new Backbone.Collection([{
													embed: true,
													value: tags,
													visible: tags.length > 0
												}, {
													visible: tags.length > 0
												}, {
													label: t("Add Tags..."),
													value: "manageTags",
													callback: _.bind(this.onManageTags, this)
												}])

						})

						return options;
					};

					b.onRemoveFromTags = function(tagToRemove) {
						R.enhancer.removeTag(tagToRemove, this.model.get("albumKey"));
						this.menuDirty = true;
					};

					b.onManageTags = function(model) {
						var that = this;

						R.loader.load(["Dialog.FormDialog"], function() {
							var dialog = new R.Components.Dialog.FormDialog({
								title: "Add Tags"
							});

							dialog.onOpen = function() {
								// Form with only a textarea allowing the user to enter tags (each separated by a comma)
								this.$(".body").html('<ul class="form_list"><li class="form_row no_line"><div class="label">Tags :<br/>(comma separated)</div><div class="field"><textarea style="height:72px;" class="tags" name="tags"></textarea></div></li></ul>');
								this.$(".body .tags").val(R.enhancer.getTagsForAlbum(that.model.get("albumKey")));
								this.$(".footer .blue").removeAttr("disabled");

								// Save the tags when the user click on confirm
								this.$(".footer .blue").on("click", _.bind(function() {
									var tags = _.map(this.$(".body .tags").val().trim().split(","), function(tag) { return tag.trim(); });

									// Compare with previously set tags - might need to remove some
									var previousTags = R.enhancer.getTagsForAlbum(that.model.get("albumKey"));

									_.each(_.difference(previousTags, tags), function(removedTag) {
										R.enhancer.removeTag(removedTag, that.model.get("albumKey"));
									});

									R.enhancer.setTags(tags, that.model.get("albumKey"));
									that.menuDirty = true;
									this.close();
								}, this));
							};
							dialog.open()
						});
					};

					b.manageTagsVisible = function() {
						return this.model.get("type") === "al";
					};
					// End Extras menu functions

					b.orig_onRendered = b.onRendered;
					b.onRendered = function() {
						b.orig_onRendered.call(this);
					};
				}

				if(a == "PlaylistPage") {
					//console.log(b);
					b.orig_onRendered = b.onRendered;
					b.onRendered = function() {
						b.orig_onRendered.call(this);
						// R.enhancer.log(this.model);
						R.enhancer.current_playlist = this;
						if (R.enhancer.current_playlist.model.canEdit()) {
							this.$(".tracklist_toolbar .ActionMenu").append('<span class="sortpl button"><span class="text">Sort Playlist</span><span class="dropdown_arrow"></span></span>');
						}
						this.$(".tracklist_toolbar .ActionMenu").append('<span class="enhancerextras button"><span class="text">Extras</span><span class="dropdown_arrow"></span></span>');

					}

				}

				if (a == "Profile.Collection") {
					b.orig_onRendered = b.onRendered;
					b.onRendered = function() {
						b.orig_onRendered.call(this);
						R.enhancer.collection = this;

						this.$(".ViewToggle").last().after('<nav class="ViewToggle clearfix"><button type="button" class="button dropdown exportToCSV">Export to CSV<span class="dropdown_arrow"></span></button></nav>');
						this.$(".header").append('<span class="filter_container"><div class="TextInput filter"><input class="tags_filter unstyled" placeholder="Filter By Tag" name="" type="text" value=""></div></span>');
						this.$(".exportToCSV").on("click", _.bind(function() {
							var csv = [["Name", "Artist", "Album", "Track Number"].join(",")];
							var keys = ["name", "artist", "album", "trackNum"];
							var tracks = R.enhancer.collection.collectionModel.models;
							jQuery.each(tracks, function(index, track) {
								var values = [];
								jQuery.each(keys, function(index, key) {
									values.push(track.attributes[key]);
								});

								csv.push('"' + values.join('","') + '"');
							});

							var pom = document.createElement('a');
							pom.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join("\n")));
							pom.setAttribute('download', 'collection.csv');
							pom.click();
						}, this));
						this.$(".tags_filter").on("keyup", _.bind(function() {
							var value = this.$(".tags_filter").val().trim();
							var albums = R.enhancer.getAlbumsForTag(value);

							if (albums.length > 0) {
								R.enhancer.collection.collectionModel.reset();
								R.enhancer.collection.collectionModel.on("loaded", function() {
									R.enhancer.collection.collectionModel.off("loaded");
									R.enhancer.collection.collectionModel.manualFiltered = true;
									R.enhancer.collection.collectionModel.reset(R.enhancer.collection.collectionModel.filter(function(model) { return _.contains(albums, model.get("albumKey")); }));
								});
								R.enhancer.collection.collectionModel.get({start:R.enhancer.collection.collectionModel.models.length, count:R.enhancer.collection.collectionModel._limit});
							} else if (R.enhancer.collection.collectionModel.manualFiltered) {
								R.enhancer.collection.collectionModel.manualFiltered = false;
								R.enhancer.collection.collectionModel.reset();
							}
						}, this));
					}
				}

				if (a== "InfiniteScroll") {
					b.orig_ensureItemsLoaded = b.ensureItemsLoaded;
					b.ensureItemsLoaded = function() {
						// When manually filtered (by tagging system)
						// stop the component from reloading all albums
						if (this.model.manualFiltered) {
							return;
						}
						b.orig_ensureItemsLoaded.call(this);
					}
				}

				return R.Component.orig_create.call(this, a,b,c);
			};
		},

		get_setting: function(setting_name) {
			if(window.localStorage["/enhancer/settings/" + setting_name]) {
				return window.localStorage["/enhancer/settings/" + setting_name];
			}
			return false;
		},
		set_setting: function(setting_name, value) {
			window.localStorage["/enhancer/settings/" + setting_name] = value;
		},

		settings_dialog: function() {
			R.loader.load(["Dialog"], function() {
				var enhancer_settings_dialog = new R.Components.Dialog({
					title: "Rdio Enhancer Settings",
					buttons: new Backbone.Model({
						label: "Save",
						className: "blue",
						context: this,
						callback: function() {
							switch(enhancer_settings_dialog.$("input[name=enhancer_notifications]:checked").val()) {
								case "chrome":
									R.enhancer.set_setting("notifications", "chrome");
								break;
								case "none":
									R.enhancer.set_setting("notifications", "none");
								break;
								case "html":
								default:
									R.enhancer.set_setting("notifications", "html");
								break;
							}
							enhancer_settings_dialog.close();
						}
					}),
					closeButton: "Cancel"
				});
				enhancer_settings_dialog.onOpen = function() {
					this.$(".body").addClass("Dialog_FormDialog");
					this.$(".body .container").append($("#enhancer_settings_form").clone());
					// Notification settings
					var notification_setting = R.enhancer.get_setting("notifications");
					if(notification_setting === false) {
						notification_setting = "html";
					}
					this.$(".body #enhancer_notifications_" + notification_setting).prop('checked',true);
				};
				enhancer_settings_dialog.open()
			});
		},

		about_dialog: function() {
			R.loader.load(["Dialog"], function() {
				var about_enhancer = new R.Components.Dialog({
					title: "About Rdio Enhancer"
				});
				about_enhancer.onOpen = function() {
					this.$(".body").html('<p>Enhancement features brought to you by <a href="https://chrome.google.com/webstore/detail/hmaalfaappddkggilhahaebfhdmmmngf" target="_blank">Rdio Enhancer</a></p><p>Get the code or browse the code at <a href="https://github.com/matt-h/rdio-enhancer" target="_blank">https://github.com/matt-h/rdio-enhancer</a></p><p>If you like this extension, <a href="https://chrome.google.com/webstore/detail/hmaalfaappddkggilhahaebfhdmmmngf" target="_blank">please rate it here</a></p>');
				};
				about_enhancer.open()
			});
		},

		get_messages: function() {
			var messages = jQuery(".enhancer_messages");
			if(messages.length < 1) {
				messages = jQuery('<div class="enhancer_messages"></div>').appendTo("body");
				messages.on("click", ".enhancer_message_box", function(event) {
					$(this).fadeOut("slow", function() {
						$(this).remove();
					});
				});
			}
			return messages;
		},

		show_message: function(msg_txt, force_message) {
			switch(R.enhancer.get_setting("notifications")) {
				case "none":
					// Force message option shows the message if the user settings are none
					if(force_message !== true) {
						break;
					}
				case false:
				case "html":
					var messages = R.enhancer.get_messages();
					jQuery('<div class="enhancer_message_box">' + msg_txt + '</div>').appendTo(messages).fadeIn("slow").delay(10000).fadeOut("slow", function() {
						jQuery(this).remove();
					});
				break;
				case "chrome":
					var notification = webkitNotifications.createNotification(
						"",  // icon url - can be relative
						"Rdio Notification",  // notification title
						msg_txt  // notification body text
					);
					notification.show();
				break;
			}
		},

		overwrite_request: function() {
			if(!R.Api || !R.Api.request) {
				window.setTimeout(R.enhancer.overwrite_request, 100);
				return;
			}

			R.Api.origRequest = R.Api.request;
			R.Api.request = function() {
				var args = arguments[0];
				//console.log("Request");
				//R.enhancer.log(arguments);

				// The Create/Add to playlist normally only takes one track and puts it in an array.
				// If we pass an array as the key this catches the array properly and formats it for the request.
				if (args.method == 'addToPlaylist' || args.method == 'createPlaylist') {
					var tracks = args.content.tracks;
					// R.enhancer.log(args.content);
					if (tracks.length == 1 && tracks[0] instanceof Array) {
						args.content.tracks = args.content.tracks[0];
						return R.Api.request(args);
					}
				}
				return R.Api.origRequest.apply(this, arguments);
			};
		},

		getTracks: function(callback) {
			if(R.enhancer.current_playlist.model.get("tracks").length() == R.enhancer.current_playlist.model.get("tracks").limit()) {
				// Currently have all tracks
				callback(R.enhancer.current_playlist.model.get("tracks").models);
			}
			else {
				R.enhancer.show_message('Fetching playlist data... Please wait. If your playlist is long this can take awhile.', true);
				R.enhancer.current_playlist.model.get("tracks").fetch({
					"success": function(self,resp,newModels) {
						callback(R.enhancer.current_playlist.model.get("tracks").models);
					},
					"error": function() {
						R.enhancer.show_message('There was an error getting the playlist data, if you have a long playlist try scrolling down to load more first and then try the action again.', true);
					}
				});
			}
		},

		getKeys: function(tracks) {
			var keys = [];
			jQuery.each(tracks, function(index, track) {
				var track_key = track.attributes.source.attributes.key;
				keys.push(track_key);
			});
			return keys;
		},

		// Sort functions
		sortByArtist: function(a, b) {
			var artist_a,
			artist_b;
			if(a.attributes.source.attributes.artist) {
				artist_a = a.attributes.source.attributes.artist;
			}
			else {
				artist_a = a.attributes.source.attributes.albumArtist;
			}
			if(b.attributes.source.attributes.artist) {
				artist_b = b.attributes.source.attributes.artist;
			}
			else {
				artist_b = b.attributes.source.attributes.albumArtist;
			}
			artist_a = artist_a.toLowerCase(),
			artist_b = artist_b.toLowerCase();
			if (artist_a < artist_b) {
				return -1;
			}
			else if (artist_a > artist_b) {
				return 1;
			}
			else {
				return R.enhancer.sortByAlbum(a, b);
			}
		},

		sortByAlbum: function(a, b) {
			var album_a = a.attributes.source.attributes.album.toLowerCase(),
			album_b = b.attributes.source.attributes.album.toLowerCase();
			if (album_a < album_b) {
				return -1;
			}
			else if (album_a > album_b) {
				return 1;
			}
			else {
				return R.enhancer.sortByTrackNum(a, b);
			}
		},

		sortByReleaseDate: function(a, b) {
			var date_a = a.attributes.source.attributes.releaseDate,
			date_b = b.attributes.source.attributes.releaseDate;



			if (date_a < date_b) {
				return -1;
			}
			else if (date_a > date_b) {
				return 1;
			}
			else {
				return R.enhancer.sortByAlbum(a, b);
			}
		},

		sortByTrackName: function(a, b) {
			var trackname_a = a.attributes.source.attributes.name.toLowerCase(),
			trackname_b = b.attributes.source.attributes.name.toLowerCase();
			if (trackname_a < trackname_b) {
				return -1;
			}
			else if (trackname_a > trackname_b) {
				return 1;
			}
			else {
				return R.enhancer.sortByTrackNum(a, b);
			}
		},

		sortByTrackNum: function(a, b) {
			if (a.attributes.source.attributes.trackNum < b.attributes.source.attributes.trackNum) {
				return -1;
			}
			else if (a.attributes.source.attributes.trackNum > b.attributes.source.attributes.trackNum) {
				return 1;
			}
			else {
				return 0;
			}
		},

		// Sort playlist
		sortPlaylist: function(key, tracks, callback) {
			if(typeof(callback) === "undefined") {
				callback = function(status) {
					if (status.result) {
						return true;
					}
					else {
						return false;
					}
				};
			}
			R.Api.request({
				method:"setPlaylistOrder",
				content: {
					playlist:key,
					tracks:tracks,
					extras: ["-*", "Playlist.PUBLISHED"]
				},
				success: callback
			});
		},

		isInQueue: function(data, queue_type) {
			if (!player_model || !player_model.queue) {
				return false;
			}
			var m = player_model.queue.length;
			var key;
			if (data.key) {
				key = data.key;
			}
			else {
				key = "" + data.type + data.id;
			}
			while (m--) {
				if (player_model.queue[m].key == key) {
					if (!queue_type) {
						return true;
					}
					else {
						if (player_model.queue[m].type == queue_type && player_model.queue[m].secondary_id == data.secondary_id) {
							return true;
						}
					}
				}
			}
		},

		// Tagging (uses localstorage to store tag set by the user)
		//
		getAlbumsForTag: function(tag) {
			if (window.localStorage) {
				var value = window.localStorage["/enhancer/tags/tag/" + tag];
				if (value) {
					return JSON.parse(value);
				}
				else {
					// This else is temporary to not lose data from the old tag saving. This will be removed eventually once enough time has passed to ensure all tags are upgraded.
					var value = window.localStorage[tag];
					if (value) {
						window.localStorage["/enhancer/tags/tag/" + tag] = value;
						window.localStorage.removeItem(tag)
						return JSON.parse(value);
					}
				}
			}

			return [];
		},
		getTagsForAlbum: function(albumKey) {
			if (window.localStorage) {
				var value = window.localStorage["/enhancer/tags/ablum/" + albumKey];
				if (value) {
					return JSON.parse(value);
				}
				else {
					// This else is temporary to not lose data from the old tag saving. This will be removed eventually once enough time has passed to ensure all tags are upgraded.
					var value = window.localStorage[albumKey];
					if (value) {
						window.localStorage["/enhancer/tags/ablum/" + albumKey] = value;
						window.localStorage.removeItem(albumKey)
						return JSON.parse(value);
					}
				}
			}

			return [];
		},
		setTags: function(tags, albumKey) {
			if (window.localStorage) {
				// Set the tags for the current albums
				window.localStorage[albumKey] = JSON.stringify(tags);

				// For every tags, add the album key to it's list of albums
				// This will facilitate ease & speed of search by tag
				_.each(tags, _.bind(function(tag) {
					var albumsForTag = window.localStorage[tag];
					albumsForTag ? albumsForTag = JSON.parse(albumsForTag) : albumsForTag = [];

					if (!_.contains(albumsForTag, albumKey)) {
						albumsForTag.push(albumKey);
						window.localStorage["/enhancer/tags/tag/" + tag] = JSON.stringify(albumsForTag);
					}
				},this));
			}
		},
		removeTag: function(tagToRemove, albumKey) {
			var tagsForAlbum = R.enhancer.getTagsForAlbum(albumKey),
			albumsForTag = R.enhancer.getAlbumsForTag(tagToRemove);

			// Remove tag from album's tags list
			tagsForAlbum = _.filter(tagsForAlbum, function(tag) { return tag !== tagToRemove; });
			window.localStorage["/enhancer/tags/ablum/" + albumKey] = JSON.stringify(tagsForAlbum);

			// Remove album from tag albums list
			albumsForTag = _.filter(albumsForTag, function(album) { return album !== albumKey; });
			window.localStorage["/enhancer/tags/tag/" + tagToRemove] = JSON.stringify(albumsForTag);
		}
	};

	// Call all of the overwrite functions to hook into Rdio
	R.enhancer.overwrite_playlist();
	R.enhancer.overwrite_create();
	R.enhancer.overwrite_request();
}

var enhancer_html = document.createElement("div");
enhancer_html.id = "enhancer_html";
document.body.appendChild(enhancer_html);
var xhr = new XMLHttpRequest();
xhr.onreadystatechange = function() {
	if (xhr.readyState == 4) {
		document.getElementById("enhancer_html").innerHTML = xhr.responseText;
	}
};
xhr.open("GET", chrome.extension.getURL("options.html"), true);
xhr.send();

var script = document.createElement("script");
script.type = "text/javascript";
script.text = codeToString(injectedJs);
document.body.appendChild(script);
